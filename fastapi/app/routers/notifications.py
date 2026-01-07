from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models import Customer, NetworkNotice
from app.schemas import (
    SendNotificationRequest,
    SendCustomMessageRequest,
    SendToPhoneRequest,
    NotificationResponse,
    NetworkNoticeResponse,
    CustomerResponse,
    WhatsAppStatusResponse,
    SendResult
)
from app.services.whatsapp import whatsapp_service

router = APIRouter(tags=["notifications"])


@router.get("/api/whatsapp/status", response_model=WhatsAppStatusResponse)
async def get_whatsapp_status():
    """
    Cek status koneksi WhatsApp
    """
    status = await whatsapp_service.get_status()
    
    if status.get("connected"):
        message = f"WhatsApp terhubung sebagai {status.get('phone_number')}"
    elif status.get("has_qr"):
        message = "WhatsApp belum login. Scan QR code di /api/whatsapp/qr"
    elif status.get("error"):
        message = status.get("error")
    else:
        message = "Menunggu WhatsApp Gateway..."
    
    return WhatsAppStatusResponse(
        connected=status.get("connected", False),
        phone_number=status.get("phone_number"),
        message=message,
        qr_code=None
    )


@router.get("/api/whatsapp/qr")
async def get_whatsapp_qr():
    """
    Ambil QR Code untuk login WhatsApp.
    Scan QR ini dengan WhatsApp di HP Anda.
    """
    result = await whatsapp_service.get_qr()
    return result


@router.post("/api/whatsapp/connect")
async def connect_whatsapp():
    """
    Cek koneksi ke WhatsApp Gateway
    """
    result = await whatsapp_service.connect()
    return result


@router.post("/api/whatsapp/restart")
async def restart_whatsapp():
    """
    Restart WhatsApp client (jika perlu scan ulang QR)
    """
    result = await whatsapp_service.restart()
    return result


@router.post("/api/whatsapp/logout")
async def logout_whatsapp():
    """
    Logout dari WhatsApp (perlu scan QR lagi)
    """
    result = await whatsapp_service.logout()
    return result


@router.get("/api/notices", response_model=List[NetworkNoticeResponse])
async def get_notices(
    active_only: bool = Query(True, description="Hanya tampilkan notice yang aktif"),
    db: Session = Depends(get_db)
):
    """
    Ambil daftar pemberitahuan gangguan
    """
    query = db.query(NetworkNotice)
    
    if active_only:
        query = query.filter(NetworkNotice.is_active == True)
    
    notices = query.order_by(NetworkNotice.created_at.desc()).all()
    return notices


@router.get("/api/notices/{notice_id}", response_model=NetworkNoticeResponse)
async def get_notice(notice_id: int, db: Session = Depends(get_db)):
    """
    Ambil detail pemberitahuan gangguan berdasarkan ID
    """
    notice = db.query(NetworkNotice).filter(NetworkNotice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="Pemberitahuan tidak ditemukan")
    return notice


@router.get("/api/customers", response_model=List[CustomerResponse])
async def get_customers(
    active_only: bool = Query(True, description="Hanya tampilkan pelanggan aktif"),
    odp: Optional[str] = Query(None, description="Filter berdasarkan ODP"),
    db: Session = Depends(get_db)
):
    """
    Ambil daftar pelanggan
    """
    query = db.query(Customer)
    
    if active_only:
        query = query.filter(Customer.is_active == True)
    
    if odp:
        query = query.filter(Customer.odp == odp)
    
    customers = query.all()
    return customers


@router.post("/api/send/notification", response_model=NotificationResponse)
async def send_notification(
    request: SendNotificationRequest,
    db: Session = Depends(get_db)
):
    """
    Kirim notifikasi gangguan ke pelanggan via WhatsApp
    
    - Jika notice_id tidak diisi, akan mengambil notice aktif terbaru
    - Jika customer_ids tidak diisi, akan kirim ke semua pelanggan aktif
    - Pelanggan dengan nomor telepon '0' atau invalid akan dilewati
    """
    # Ambil notice
    if request.notice_id:
        notice = db.query(NetworkNotice).filter(NetworkNotice.id == request.notice_id).first()
        if not notice:
            raise HTTPException(status_code=404, detail="Pemberitahuan tidak ditemukan")
    else:
        # Ambil notice aktif terbaru
        notice = db.query(NetworkNotice).filter(
            NetworkNotice.is_active == True
        ).order_by(NetworkNotice.created_at.desc()).first()
        
        if not notice:
            raise HTTPException(status_code=404, detail="Tidak ada pemberitahuan aktif")
    
    # Siapkan pesan
    message = request.custom_message or _format_notice_message(notice)
    
    # Ambil pelanggan
    query = db.query(Customer).filter(Customer.is_active == True)
    
    if request.customer_ids:
        query = query.filter(Customer.id.in_(request.customer_ids))
    
    # Jika notice memiliki affected_odp, filter pelanggan berdasarkan ODP
    if notice.affected_odp and not request.customer_ids:
        odp_list = [odp.strip() for odp in notice.affected_odp.split(',')]
        query = query.filter(Customer.odp.in_(odp_list))
    
    customers = query.all()
    
    if not customers:
        return NotificationResponse(
            success=True,
            message="Tidak ada pelanggan yang perlu dikirim notifikasi",
            total_customers=0,
            sent_count=0,
            failed_count=0,
            skipped_count=0,
            results=[]
        )
    
    # Siapkan recipients
    recipients = [
        {"phone": c.phone, "name": c.name, "id": c.id}
        for c in customers
    ]
    
    # Kirim pesan
    results = await whatsapp_service.send_bulk(recipients, message)
    
    # Hitung statistik
    sent_count = sum(1 for r in results if r.get("success"))
    failed_count = sum(1 for r in results if not r.get("success") and r.get("error") != "Nomor tidak valid atau 0")
    skipped_count = sum(1 for r in results if r.get("error") == "Nomor tidak valid atau 0")
    
    return NotificationResponse(
        success=True,
        message=f"Notifikasi berhasil diproses untuk {len(customers)} pelanggan",
        total_customers=len(customers),
        sent_count=sent_count,
        failed_count=failed_count,
        skipped_count=skipped_count,
        results=[SendResult(**r) for r in results]
    )


@router.post("/api/send/custom", response_model=NotificationResponse)
async def send_custom_message(
    request: SendCustomMessageRequest,
    db: Session = Depends(get_db)
):
    """
    Kirim pesan kustom ke pelanggan
    
    - Jika customer_ids tidak diisi, akan kirim ke semua pelanggan aktif
    - Gunakan {name} atau {nama} sebagai placeholder untuk nama pelanggan
    """
    # Ambil pelanggan
    query = db.query(Customer).filter(Customer.is_active == True)
    
    if request.customer_ids:
        query = query.filter(Customer.id.in_(request.customer_ids))
    
    customers = query.all()
    
    if not customers:
        return NotificationResponse(
            success=True,
            message="Tidak ada pelanggan yang perlu dikirim pesan",
            total_customers=0,
            sent_count=0,
            failed_count=0,
            skipped_count=0,
            results=[]
        )
    
    # Siapkan recipients
    recipients = [
        {"phone": c.phone, "name": c.name, "id": c.id}
        for c in customers
    ]
    
    # Kirim pesan
    results = await whatsapp_service.send_bulk(recipients, request.message)
    
    # Hitung statistik
    sent_count = sum(1 for r in results if r.get("success"))
    failed_count = sum(1 for r in results if not r.get("success") and r.get("error") != "Nomor tidak valid atau 0")
    skipped_count = sum(1 for r in results if r.get("error") == "Nomor tidak valid atau 0")
    
    return NotificationResponse(
        success=True,
        message=f"Pesan berhasil diproses untuk {len(customers)} pelanggan",
        total_customers=len(customers),
        sent_count=sent_count,
        failed_count=failed_count,
        skipped_count=skipped_count,
        results=[SendResult(**r) for r in results]
    )


@router.post("/api/send/phone")
async def send_to_phone(request: SendToPhoneRequest):
    """
    Kirim pesan ke nomor telepon tertentu (untuk testing)
    """
    result = await whatsapp_service.send_message(request.phone, request.message)
    return result


@router.post("/api/send/by-odp/{odp}", response_model=NotificationResponse)
async def send_by_odp(
    odp: str,
    request: SendNotificationRequest,
    db: Session = Depends(get_db)
):
    """
    Kirim notifikasi ke pelanggan berdasarkan ODP tertentu
    """
    # Ambil notice
    if request.notice_id:
        notice = db.query(NetworkNotice).filter(NetworkNotice.id == request.notice_id).first()
        if not notice:
            raise HTTPException(status_code=404, detail="Pemberitahuan tidak ditemukan")
        message = request.custom_message or _format_notice_message(notice)
    else:
        if not request.custom_message:
            raise HTTPException(
                status_code=400, 
                detail="notice_id atau custom_message harus diisi"
            )
        message = request.custom_message
    
    # Ambil pelanggan berdasarkan ODP
    customers = db.query(Customer).filter(
        and_(Customer.is_active == True, Customer.odp == odp)
    ).all()
    
    if not customers:
        return NotificationResponse(
            success=True,
            message=f"Tidak ada pelanggan aktif di ODP {odp}",
            total_customers=0,
            sent_count=0,
            failed_count=0,
            skipped_count=0,
            results=[]
        )
    
    # Siapkan recipients
    recipients = [
        {"phone": c.phone, "name": c.name, "id": c.id}
        for c in customers
    ]
    
    # Kirim pesan
    results = await whatsapp_service.send_bulk(recipients, message)
    
    # Hitung statistik
    sent_count = sum(1 for r in results if r.get("success"))
    failed_count = sum(1 for r in results if not r.get("success") and r.get("error") != "Nomor tidak valid atau 0")
    skipped_count = sum(1 for r in results if r.get("error") == "Nomor tidak valid atau 0")
    
    return NotificationResponse(
        success=True,
        message=f"Notifikasi berhasil diproses untuk {len(customers)} pelanggan di ODP {odp}",
        total_customers=len(customers),
        sent_count=sent_count,
        failed_count=failed_count,
        skipped_count=skipped_count,
        results=[SendResult(**r) for r in results]
    )


def _format_notice_message(notice: NetworkNotice) -> str:
    """
    Format pesan dari NetworkNotice
    """
    severity_emoji = {
        "low": "ℹ️",
        "medium": "⚠️",
        "high": "🔴",
        "critical": "🚨"
    }
    
    type_text = {
        "gangguan": "GANGGUAN JARINGAN",
        "maintenance": "MAINTENANCE TERJADWAL"
    }
    
    emoji = severity_emoji.get(notice.severity, "ℹ️")
    notice_type = type_text.get(notice.type, "PEMBERITAHUAN")
    
    message = f"""
{emoji} *{notice_type}* {emoji}

*{notice.title}*

{notice.message}
"""
    
    if notice.affected_area:
        message += f"\n📍 *Area Terdampak:* {notice.affected_area}"
    
    if notice.start_time:
        message += f"\n🕐 *Mulai:* {notice.start_time.strftime('%d/%m/%Y %H:%M')}"
    
    if notice.end_time:
        message += f"\n🕐 *Estimasi Selesai:* {notice.end_time.strftime('%d/%m/%Y %H:%M')}"
    
    message += """

Untuk informasi perkembangan terbaru, silakan cek melalui link berikut:
👉 https://rumahkitanet.site/status-jaringan

Mohon maaf atas ketidaknyamanan ini.
Terima kasih atas pengertiannya.

_Pesan ini dikirim otomatis_
"""
    
    return message.strip()
