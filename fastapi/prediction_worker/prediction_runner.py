#!/usr/bin/env python3
import argparse
import base64
import json
import math
import os
import pickle
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dashboard prediction worker")
    parser.add_argument("--mode", choices=["train", "snapshot"], required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model-path", required=True)
    return parser.parse_args()


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, payload: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def format_local_iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:00:00+07:00")


@dataclass
class HourlyRevenueRow:
    ts: datetime
    revenue: float
    expense: float
    adjustment: float
    complaint_count: float
    incident_count: float


def parse_hourly_history(payload: Dict[str, Any]) -> List[HourlyRevenueRow]:
    rows = []
    for item in payload.get("hourly_revenue_history", []):
        ts_str = str(item.get("ts", "")).strip()
        if not ts_str:
            continue

        parsed_ts: Optional[datetime] = None
        for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M"]:
            try:
                parsed_ts = datetime.strptime(ts_str, fmt)
                break
            except ValueError:
                continue
        if parsed_ts is None:
            try:
                parsed_ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except ValueError:
                continue

        rows.append(HourlyRevenueRow(
            ts=parsed_ts.replace(minute=0, second=0, microsecond=0),
            revenue=max(0.0, safe_float(item.get("revenue"))),
            expense=max(0.0, safe_float(item.get("expense"))),
            adjustment=safe_float(item.get("adjustment")),
            complaint_count=max(0.0, safe_float(item.get("complaint_count"))),
            incident_count=max(0.0, safe_float(item.get("incident_count"))),
        ))

    rows.sort(key=lambda r: r.ts)
    return rows


def build_hourly_feature_matrix(rows: List[HourlyRevenueRow]) -> Tuple[List[List[float]], List[float], List[datetime]]:
    x: List[List[float]] = []
    y: List[float] = []
    timestamps: List[datetime] = []

    values = [r.revenue for r in rows]
    complaints = [r.complaint_count for r in rows]
    incidents = [r.incident_count for r in rows]
    expenses = [r.expense for r in rows]
    adjustments = [r.adjustment for r in rows]

    max_lag = 48
    for i in range(len(rows)):
        if i < max_lag:
            continue

        cur_ts = rows[i].ts
        lag1 = values[i - 1]
        lag3 = values[i - 3]
        lag6 = values[i - 6]
        lag12 = values[i - 12]
        lag24 = values[i - 24]
        lag48 = values[i - 48]

        rolling6 = sum(values[i - 6:i]) / 6.0
        rolling24 = sum(values[i - 24:i]) / 24.0
        complaints6 = sum(complaints[i - 6:i]) / 6.0
        incidents24 = sum(incidents[i - 24:i]) / 24.0
        expense6 = sum(expenses[i - 6:i]) / 6.0
        adj6 = sum(adjustments[i - 6:i]) / 6.0

        feat = [
            lag1, lag3, lag6, lag12, lag24, lag48,
            rolling6, rolling24,
            complaints6, incidents24, expense6, adj6,
            float(cur_ts.hour),
            float(cur_ts.weekday()),
            float(cur_ts.day),
            float(cur_ts.month),
            float(i),
        ]

        x.append(feat)
        y.append(values[i])
        timestamps.append(cur_ts)

    return x, y, timestamps


def try_train_xgboost(x: List[List[float]], y: List[float]):
    try:
        from xgboost import XGBRegressor

        model = XGBRegressor(
            n_estimators=360,
            max_depth=6,
            learning_rate=0.045,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            random_state=42,
        )
        model.fit(x, y)
        return model, "xgboost"
    except Exception:
        return None, None


def try_train_sklearn(x: List[List[float]], y: List[float]):
    try:
        from sklearn.ensemble import RandomForestRegressor

        model = RandomForestRegressor(
            n_estimators=260,
            max_depth=12,
            random_state=42,
            min_samples_leaf=2,
        )
        model.fit(x, y)
        return model, "random_forest"
    except Exception:
        return None, None


def train_or_fallback(x: List[List[float]], y: List[float]):
    model, model_name = try_train_xgboost(x, y)
    if model is not None:
        return model, model_name

    model, model_name = try_train_sklearn(x, y)
    if model is not None:
        return model, model_name

    return None, "naive_lag"


def mape(actual: List[float], predicted: List[float]) -> float:
    if not actual:
        return 0.0
    total = 0.0
    for a, p in zip(actual, predicted):
        total += abs(a - p) / max(abs(a), 1.0)
    return (total / len(actual)) * 100.0


def smape(actual: List[float], predicted: List[float]) -> float:
    if not actual:
        return 0.0
    total = 0.0
    for a, p in zip(actual, predicted):
        den = (abs(a) + abs(p)) / 2.0
        total += 0.0 if den == 0 else abs(a - p) / den
    return (total / len(actual)) * 100.0


def eval_model(model: Any, x: List[List[float]], y: List[float]) -> Dict[str, float]:
    if not x or not y:
        return {"smape": 0.0, "mae": 0.0, "mape": 0.0}

    split_idx = max(int(len(x) * 0.8), 1)
    x_test = x[split_idx:] if len(x[split_idx:]) >= 3 else x
    y_test = y[split_idx:] if len(y[split_idx:]) >= 3 else y

    if model is None:
        preds = [max(0.0, row[0]) for row in x_test]
    else:
        preds = [max(0.0, safe_float(v)) for v in model.predict(x_test)]

    mae = sum(abs(a - p) for a, p in zip(y_test, preds)) / max(len(y_test), 1)
    return {
        "smape": round(smape(y_test, preds), 4),
        "mape": round(mape(y_test, preds), 4),
        "mae": round(mae, 4),
    }


def serialize_model(model: Any) -> str:
    raw = pickle.dumps(model)
    return base64.b64encode(raw).decode("utf-8")


def deserialize_model(encoded: str) -> Any:
    raw = base64.b64decode(encoded.encode("utf-8"))
    return pickle.loads(raw)


def save_model_bundle(path: str, model: Any, model_name: str, metrics: Dict[str, float]) -> Dict[str, Any]:
    payload = {
        "model_version": f"{model_name}-hourly-v2.1",
        "model_name": model_name,
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "metrics": metrics,
        "model_blob": serialize_model(model) if model is not None else None,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    return payload


def load_model_bundle(path: str) -> Optional[Dict[str, Any]]:
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return None
    return data


def predict_hourly_horizon_24h(model: Any, rows: List[HourlyRevenueRow], residual_std: float) -> List[Dict[str, Any]]:
    if not rows:
        return []

    values = [r.revenue for r in rows]
    complaints = [r.complaint_count for r in rows]
    incidents = [r.incident_count for r in rows]
    expenses = [r.expense for r in rows]
    adjustments = [r.adjustment for r in rows]

    avg_complaint = (sum(complaints[-24:]) / max(min(len(complaints), 24), 1)) if complaints else 0.0
    avg_incident = (sum(incidents[-24:]) / max(min(len(incidents), 24), 1)) if incidents else 0.0
    avg_expense = (sum(expenses[-24:]) / max(min(len(expenses), 24), 1)) if expenses else 0.0
    avg_adjustment = (sum(adjustments[-24:]) / max(min(len(adjustments), 24), 1)) if adjustments else 0.0

    cur_ts = rows[-1].ts
    output = []

    for h in range(1, 25):
        cur_ts = cur_ts + timedelta(hours=1)

        lag1 = values[-1] if len(values) >= 1 else 0.0
        lag3 = values[-3] if len(values) >= 3 else lag1
        lag6 = values[-6] if len(values) >= 6 else lag3
        lag12 = values[-12] if len(values) >= 12 else lag6
        lag24 = values[-24] if len(values) >= 24 else lag12
        lag48 = values[-48] if len(values) >= 48 else lag24

        rolling6 = sum(values[-6:]) / max(min(len(values), 6), 1)
        rolling24 = sum(values[-24:]) / max(min(len(values), 24), 1)

        feat = [
            lag1, lag3, lag6, lag12, lag24, lag48,
            rolling6, rolling24,
            avg_complaint, avg_incident, avg_expense, avg_adjustment,
            float(cur_ts.hour),
            float(cur_ts.weekday()),
            float(cur_ts.day),
            float(cur_ts.month),
            float(len(values)),
        ]

        if model is None:
            pred = (lag1 * 0.50) + (rolling6 * 0.35) + (rolling24 * 0.15)
        else:
            pred = safe_float(model.predict([feat])[0])

        pred = max(0.0, pred)
        values.append(pred)

        confidence = max(40.0, min(98.0, 96.0 - (h * 1.35)))
        spread = max(20000.0, residual_std * (1.0 + (h * 0.06)))
        lower_bound = max(0.0, pred - spread)
        upper_bound = pred + spread

        output.append({
            "ts": format_local_iso(cur_ts),
            "predicted_revenue": round(pred, 2),
            "confidence": round(confidence, 2),
            "lower_bound": round(lower_bound, 2),
            "upper_bound": round(upper_bound, 2),
        })

    return output


def compute_backtest_report(
    model: Any,
    x: List[List[float]],
    y: List[float],
    timestamps: List[datetime],
) -> Dict[str, Any]:
    if model is None:
        preds = [max(0.0, row[0]) for row in x]
    else:
        preds = [max(0.0, safe_float(v)) for v in model.predict(x)]

    def window_report(window_hours: int) -> Dict[str, Any]:
        if len(y) < window_hours or len(preds) < window_hours or len(timestamps) < window_hours:
            return {
                "mape": None,
                "smape": None,
                "sample_size": min(len(y), len(preds), len(timestamps)),
                "period_start": None,
                "period_end": None,
                "reason": "insufficient_sample",
            }

        actual_slice = y[-window_hours:]
        pred_slice = preds[-window_hours:]
        ts_slice = timestamps[-window_hours:]

        return {
            "mape": round(mape(actual_slice, pred_slice), 4),
            "smape": round(smape(actual_slice, pred_slice), 4),
            "sample_size": len(actual_slice),
            "period_start": format_local_iso(ts_slice[0]),
            "period_end": format_local_iso(ts_slice[-1]),
        }

    return {
        "window_7d": window_report(7 * 24),
        "window_30d": window_report(30 * 24),
        "last_calculated_at": datetime.utcnow().isoformat() + "Z",
    }


def linear_trend_next(series: List[float], steps: int) -> List[float]:
    if len(series) < 2:
        base = series[-1] if series else 0.0
        return [base for _ in range(steps)]

    try:
        import numpy as np

        x = np.arange(len(series), dtype=float)
        y = np.array(series, dtype=float)
        coef = np.polyfit(x, y, deg=1)
        trend = np.poly1d(coef)
        preds = []
        for idx in range(len(series), len(series) + steps):
            preds.append(float(trend(idx)))
        return preds
    except Exception:
        delta = series[-1] - series[-2]
        return [series[-1] + (delta * (i + 1)) for i in range(steps)]


def build_monthly_forecasts(monthly_sources: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not monthly_sources:
        return {
            "customer_growth_forecast_monthly": {"months": []},
            "monthly_total_revenue_forecast": {"months": []},
        }

    months = [str(item.get("month")) for item in monthly_sources]
    billing = [safe_float(item.get("billing_recurring")) for item in monthly_sources]
    installation = [safe_float(item.get("installation")) for item in monthly_sources]
    other_income = [safe_float(item.get("other_financial_income")) for item in monthly_sources]
    expense = [safe_float(item.get("expense_total")) for item in monthly_sources]

    future_steps = 6
    billing_pred = linear_trend_next(billing, future_steps)
    installation_pred = linear_trend_next(installation, future_steps)
    other_pred = linear_trend_next(other_income, future_steps)
    expense_pred = linear_trend_next(expense, future_steps)

    last_month = datetime.strptime(months[-1] + "-01", "%Y-%m-%d")
    revenue_rows = []
    customer_rows = []

    baseline_customers = max(int(round((billing[-1] / 250000.0))) if billing[-1] > 0 else 0, 1)
    growth_base = 0.02

    for i in range(future_steps):
        month_date = (last_month.replace(day=1) + timedelta(days=32 * (i + 1))).replace(day=1)
        month_key = month_date.strftime("%Y-%m")

        b = max(billing_pred[i], 0.0)
        ins = max(installation_pred[i], 0.0)
        oth = max(other_pred[i], 0.0)
        exp = max(expense_pred[i], 0.0)
        gross = b + ins + oth
        net = gross - exp

        revenue_rows.append({
            "month": month_key,
            "billing_recurring": round(b, 2),
            "installation": round(ins, 2),
            "other_financial_income": round(oth, 2),
            "gross_total": round(gross, 2),
            "expense_total": round(exp, 2),
            "net_total": round(net, 2),
        })

        growth_multiplier = (1.0 + growth_base) ** (i + 1)
        customer_rows.append({
            "month": month_key,
            "predicted_total_customers": int(round(baseline_customers * growth_multiplier)),
            "predicted_new_customers": int(round((baseline_customers * growth_base) * growth_multiplier)),
        })

    return {
        "customer_growth_forecast_monthly": {"months": customer_rows},
        "monthly_total_revenue_forecast": {"months": revenue_rows},
    }


def build_collection_probability(customer_signals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    output = []
    for row in customer_signals:
        overdue = safe_float(row.get("days_overdue"))
        open_count = safe_float(row.get("open_invoice_count"))
        open_amount = safe_float(row.get("open_invoice_amount"))
        active = 1.0 if bool(row.get("is_active")) else 0.0

        raw = 2.2 - (0.085 * overdue) - (0.45 * open_count) - (open_amount / 3000000.0) + (0.35 * active)
        prob = 1.0 / (1.0 + math.exp(-raw))
        score = round(prob * 100.0, 2)
        risk = "high" if score < 45 else ("medium" if score < 70 else "low")
        output.append({
            "customer_id": row.get("customer_id"),
            "name": row.get("name"),
            "collection_probability_pct": score,
            "risk_level": risk,
            "open_invoice_amount": round(open_amount, 2),
            "days_overdue": int(overdue),
        })

    output.sort(key=lambda x: (x["collection_probability_pct"], -x["open_invoice_amount"]))
    return output[:120]


def build_risk_alarm(invoice_signals: Dict[str, Any], predicted_24h_total: float) -> Dict[str, Any]:
    summary = invoice_signals.get("status_summary", {})
    overdue_rate = safe_float(summary.get("overdue_count")) / max(
        safe_float(summary.get("paid_count")) + safe_float(summary.get("unpaid_count")) + safe_float(summary.get("overdue_count")) + safe_float(summary.get("waiting_count")),
        1.0,
    )
    overdue_amount = safe_float(summary.get("overdue_amount"))
    waiting_amount = safe_float(summary.get("waiting_amount"))

    risk_score = (overdue_rate * 55.0) + min(overdue_amount / 1500000.0, 30.0) + min(waiting_amount / 2500000.0, 18.0)
    if predicted_24h_total < (overdue_amount * 0.2):
        risk_score += 12.0

    risk_score = max(min(risk_score, 100.0), 0.0)
    level = "critical" if risk_score >= 70 else ("warning" if risk_score >= 40 else "normal")

    return {
        "risk_level": level,
        "risk_score": round(risk_score, 2),
        "top_drivers": {
            "overdue_rate": round(overdue_rate * 100.0, 2),
            "overdue_amount": round(overdue_amount, 2),
            "waiting_confirmation_amount": round(waiting_amount, 2),
            "predicted_revenue_24h": round(predicted_24h_total, 2),
        },
    }


def build_what_if(monthly_sources: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not monthly_sources:
        return {"baseline_month_net": 0.0, "scenarios": []}

    latest = monthly_sources[-1]
    gross = safe_float(latest.get("gross_total"))
    expense = safe_float(latest.get("expense_total"))
    baseline = safe_float(latest.get("net_total"))

    return {
        "baseline_month_net": round(baseline, 2),
        "scenarios": [
            {
                "key": "collection_plus_10pct",
                "label": "Collection +10%",
                "estimated_delta_net": round(gross * 0.10, 2),
                "new_net_estimate": round(baseline + (gross * 0.10), 2),
            },
            {
                "key": "expense_minus_10pct",
                "label": "Expense -10%",
                "estimated_delta_net": round(expense * 0.10, 2),
                "new_net_estimate": round(baseline + (expense * 0.10), 2),
            },
            {
                "key": "collection_minus_10pct",
                "label": "Collection -10%",
                "estimated_delta_net": round(-(gross * 0.10), 2),
                "new_net_estimate": round(baseline - (gross * 0.10), 2),
            },
        ],
    }


def run_train(payload: Dict[str, Any], model_path: str) -> Dict[str, Any]:
    rows = parse_hourly_history(payload)
    x, y, timestamps = build_hourly_feature_matrix(rows)

    model, model_name = train_or_fallback(x, y)
    metrics = eval_model(model, x, y)
    model_bundle = save_model_bundle(model_path, model, model_name, metrics)

    history_coverage = {
        "sample_hours": len(rows),
        "sample_features": len(x),
        "period_start": format_local_iso(rows[0].ts) if rows else None,
        "period_end": format_local_iso(rows[-1].ts) if rows else None,
    }

    return {
        "ok": True,
        "model_meta": {
            "model_version": model_bundle.get("model_version"),
            "model_name": model_name,
            "metrics": metrics,
            "history_coverage": history_coverage,
            "trained_at": model_bundle.get("trained_at"),
        },
    }


def run_snapshot(payload: Dict[str, Any], model_path: str) -> Dict[str, Any]:
    rows = parse_hourly_history(payload)
    x, y, timestamps = build_hourly_feature_matrix(rows)

    model_bundle = load_model_bundle(model_path)
    model = None
    model_version = "xgboost-hourly-v2.1"
    metrics = {"smape": 0.0, "mape": 0.0, "mae": 0.0}

    if model_bundle and model_bundle.get("model_blob"):
        try:
            model = deserialize_model(str(model_bundle["model_blob"]))
            model_version = str(model_bundle.get("model_version", model_version))
            metrics = dict(model_bundle.get("metrics") or metrics)
        except Exception:
            model = None

    if model is None:
        model, model_name = train_or_fallback(x, y)
        metrics = eval_model(model, x, y)
        stored = save_model_bundle(model_path, model, model_name, metrics)
        model_version = str(stored.get("model_version", model_version))

    if model is None:
        preds_for_residual = [max(0.0, row[0]) for row in x]
    else:
        preds_for_residual = [max(0.0, safe_float(v)) for v in model.predict(x)]

    residuals = [abs(a - p) for a, p in zip(y, preds_for_residual)]
    residual_std = (sum(residuals) / max(len(residuals), 1)) if residuals else 50000.0

    hourly_forecast = predict_hourly_horizon_24h(model, rows, residual_std)
    predicted_24h_total = sum(safe_float(item.get("predicted_revenue")) for item in hourly_forecast)

    invoice_signals = payload.get("invoice_signals", {}) or {}
    customer_signals = payload.get("customer_signals", []) or []
    monthly_sources = payload.get("monthly_revenue_sources", []) or []

    monthly_outputs = build_monthly_forecasts(monthly_sources)
    backtest_report = compute_backtest_report(model, x, y, timestamps)

    history_coverage = {
        "sample_hours": len(rows),
        "sample_features": len(x),
        "period_start": format_local_iso(rows[0].ts) if rows else None,
        "period_end": format_local_iso(rows[-1].ts) if rows else None,
    }

    return {
        "ok": True,
        "hourly_forecast_24h": hourly_forecast,
        "backtest_report": backtest_report,
        "risk_alarm_24h": build_risk_alarm(invoice_signals, predicted_24h_total),
        "collection_probability": build_collection_probability(customer_signals),
        "what_if_simulator": build_what_if(monthly_sources),
        "customer_growth_forecast_monthly": monthly_outputs["customer_growth_forecast_monthly"],
        "monthly_total_revenue_forecast": monthly_outputs["monthly_total_revenue_forecast"],
        "model_meta": {
            "model_version": model_version,
            "metrics": metrics,
            "predicted_revenue_24h_total": round(predicted_24h_total, 2),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "history_coverage": history_coverage,
            "trained_at": (model_bundle or {}).get("trained_at"),
        },
    }


def main():
    args = parse_args()
    payload = load_json(args.input)

    if args.mode == "train":
        result = run_train(payload, args.model_path)
    else:
        result = run_snapshot(payload, args.model_path)

    save_json(args.output, result)


if __name__ == "__main__":
    main()
