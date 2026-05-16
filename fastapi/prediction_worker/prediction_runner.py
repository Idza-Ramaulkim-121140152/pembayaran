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


@dataclass
class DailyNetRow:
    date: datetime
    net: float


def parse_daily_history(payload: Dict[str, Any]) -> List[DailyNetRow]:
    rows = []
    for item in payload.get("daily_finance_history", []):
        date_str = str(item.get("date", "")).strip()
        if not date_str:
            continue
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
        rows.append(DailyNetRow(date=day, net=safe_float(item.get("net"))))
    rows.sort(key=lambda r: r.date)
    return rows


def build_feature_matrix(rows: List[DailyNetRow]) -> Tuple[List[List[float]], List[float], List[datetime]]:
    x: List[List[float]] = []
    y: List[float] = []
    dates: List[datetime] = []
    values = [r.net for r in rows]
    for i in range(len(rows)):
        if i < 14:
            continue
        d = rows[i].date
        lag1 = values[i - 1]
        lag7 = values[i - 7]
        lag14 = values[i - 14]
        rolling7 = sum(values[i - 7 : i]) / 7.0
        rolling14 = sum(values[i - 14 : i]) / 14.0
        feat = [
            lag1,
            lag7,
            lag14,
            rolling7,
            rolling14,
            float(d.weekday()),
            float(d.day),
            float(d.month),
            float(i),
        ]
        x.append(feat)
        y.append(values[i])
        dates.append(d)
    return x, y, dates


def try_train_xgboost(x: List[List[float]], y: List[float]):
    try:
        from xgboost import XGBRegressor

        model = XGBRegressor(
            n_estimators=280,
            max_depth=5,
            learning_rate=0.05,
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
            n_estimators=220,
            max_depth=10,
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


def smape(actual: List[float], predicted: List[float]) -> float:
    if not actual:
        return 0.0
    total = 0.0
    for a, p in zip(actual, predicted):
        den = abs(a) + abs(p)
        total += 0.0 if den == 0 else abs(a - p) / (den / 2.0)
    return (total / len(actual)) * 100.0


def eval_model(model: Any, x: List[List[float]], y: List[float]) -> Dict[str, float]:
    if not x or not y:
        return {"smape": 0.0, "mae": 0.0}

    split_idx = max(int(len(x) * 0.8), 1)
    x_train = x[:split_idx]
    y_train = y[:split_idx]
    x_test = x[split_idx:]
    y_test = y[split_idx:]
    if len(x_test) < 3:
        x_test = x
        y_test = y

    if model is None:
        preds = [row[0] for row in x_test]
    else:
        preds = [safe_float(v) for v in model.predict(x_test)]

    mae = sum(abs(a - p) for a, p in zip(y_test, preds)) / max(len(y_test), 1)
    return {
        "smape": round(smape(y_test, preds), 4),
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
        "model_version": f"{model_name}-lag-v2",
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


def predict_horizon(
    model: Any,
    rows: List[DailyNetRow],
    horizon_days: int = 30,
) -> List[Dict[str, Any]]:
    if not rows:
        return []

    values = [r.net for r in rows]
    dates = [r.date for r in rows]
    cur_date = dates[-1]
    predicted_rows = []

    for _ in range(horizon_days):
        cur_date = cur_date + timedelta(days=1)
        lag1 = values[-1] if len(values) >= 1 else 0.0
        lag7 = values[-7] if len(values) >= 7 else lag1
        lag14 = values[-14] if len(values) >= 14 else lag7
        rolling7 = sum(values[-7:]) / max(min(len(values), 7), 1)
        rolling14 = sum(values[-14:]) / max(min(len(values), 14), 1)
        feat = [
            lag1,
            lag7,
            lag14,
            rolling7,
            rolling14,
            float(cur_date.weekday()),
            float(cur_date.day),
            float(cur_date.month),
            float(len(values)),
        ]

        if model is None:
            pred = (lag1 * 0.45) + (rolling7 * 0.55)
        else:
            pred = safe_float(model.predict([feat])[0])

        pred = max(pred, -500000000.0)
        values.append(pred)
        predicted_rows.append({
            "date": cur_date.strftime("%Y-%m-%d"),
            "predicted_net": round(pred, 2),
        })

    return predicted_rows


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


def build_risk_alarm(invoice_signals: Dict[str, Any], next_day_pred_net: float) -> Dict[str, Any]:
    summary = invoice_signals.get("status_summary", {})
    overdue_rate = safe_float(summary.get("overdue_count")) / max(
        safe_float(summary.get("paid_count")) + safe_float(summary.get("unpaid_count")) + safe_float(summary.get("overdue_count")) + safe_float(summary.get("waiting_count")),
        1.0,
    )
    overdue_amount = safe_float(summary.get("overdue_amount"))
    waiting_amount = safe_float(summary.get("waiting_amount"))

    risk_score = (overdue_rate * 55.0) + min(overdue_amount / 1500000.0, 30.0) + (12.0 if next_day_pred_net < 0 else 0.0) + min(waiting_amount / 2500000.0, 18.0)
    risk_score = max(min(risk_score, 100.0), 0.0)
    level = "critical" if risk_score >= 70 else ("warning" if risk_score >= 40 else "normal")

    return {
        "risk_level": level,
        "risk_score": round(risk_score, 2),
        "top_drivers": {
            "overdue_rate": round(overdue_rate * 100.0, 2),
            "overdue_amount": round(overdue_amount, 2),
            "waiting_confirmation_amount": round(waiting_amount, 2),
            "predicted_net_24h": round(next_day_pred_net, 2),
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
    rows = parse_daily_history(payload)
    x, y, _ = build_feature_matrix(rows)

    model, model_name = train_or_fallback(x, y)
    metrics = eval_model(model, x, y)
    model_bundle = save_model_bundle(model_path, model, model_name, metrics)

    return {
        "ok": True,
        "model_meta": {
            "model_version": model_bundle.get("model_version"),
            "model_name": model_name,
            "metrics": metrics,
        },
    }


def run_snapshot(payload: Dict[str, Any], model_path: str) -> Dict[str, Any]:
    rows = parse_daily_history(payload)
    x, y, _ = build_feature_matrix(rows)

    model_bundle = load_model_bundle(model_path)
    model = None
    model_version = "xgboost-lag-v2"
    metrics = {"smape": 0.0, "mae": 0.0}

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

    future = predict_horizon(model, rows, horizon_days=30)
    next_day_pred = safe_float(future[0]["predicted_net"]) if future else 0.0

    invoice_signals = payload.get("invoice_signals", {}) or {}
    customer_signals = payload.get("customer_signals", []) or []
    monthly_sources = payload.get("monthly_revenue_sources", []) or []

    monthly_outputs = build_monthly_forecasts(monthly_sources)

    return {
        "ok": True,
        "risk_alarm_24h": build_risk_alarm(invoice_signals, next_day_pred),
        "collection_probability": build_collection_probability(customer_signals),
        "what_if_simulator": build_what_if(monthly_sources),
        "customer_growth_forecast_monthly": monthly_outputs["customer_growth_forecast_monthly"],
        "monthly_total_revenue_forecast": monthly_outputs["monthly_total_revenue_forecast"],
        "model_meta": {
            "model_version": model_version,
            "metrics": metrics,
            "predicted_net_next_24h": round(next_day_pred, 2),
            "generated_at": datetime.utcnow().isoformat() + "Z",
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
