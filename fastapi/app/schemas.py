from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# Request Schemas
class SendNotificationRequest(BaseModel):
    notice_id: Optional[int] = None  # Jika None, ambil notice aktif terbaru
    customer_ids: Optional[List[int]] = None  # Jika None, kirim ke semua pelanggan aktif
    custom_message: Optional[str] = None  # Override message dari notice

class SendCustomMessageRequest(BaseModel):
    message: str
    customer_ids: Optional[List[int]] = None  # Jika None, kirim ke semua pelanggan aktif

class SendToPhoneRequest(BaseModel):
    phone: str
    message: str

# Response Schemas
class CustomerResponse(BaseModel):
    id: int
    name: str
    phone: str
    is_active: bool
    odp: Optional[str] = None
    
    class Config:
        from_attributes = True

class NetworkNoticeResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    severity: str
    is_mass: bool
    affected_area: Optional[str] = None
    affected_odp: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_active: bool
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class SendResult(BaseModel):
    phone: str
    customer_name: str
    success: bool
    error: Optional[str] = None

class NotificationResponse(BaseModel):
    success: bool
    message: str
    total_customers: int
    sent_count: int
    failed_count: int
    skipped_count: int  # Untuk nomor 0 atau invalid
    results: List[SendResult]

class WhatsAppStatusResponse(BaseModel):
    connected: bool
    phone_number: Optional[str] = None
    message: str
    qr_code: Optional[str] = None  # Base64 QR code jika perlu scan
