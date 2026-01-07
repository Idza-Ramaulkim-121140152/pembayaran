from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.routers.notifications import router as notifications_router
from app.services.whatsapp import whatsapp_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle management untuk FastAPI
    - Startup: Inisialisasi WhatsApp connection
    - Shutdown: Cleanup resources
    """
    # Startup
    print("🚀 Starting WhatsApp Notification Service...")
    result = await whatsapp_service.connect()
    status = await whatsapp_service.get_status()
    
    if status.get("connected"):
        print(f"✅ WhatsApp terhubung sebagai {status.get('phone_number')}")
    elif status.get("has_qr"):
        print("📱 WhatsApp Gateway siap. Scan QR code di http://localhost:8000/api/whatsapp/qr")
    else:
        print("⚠️ WhatsApp Gateway belum tersedia. Jalankan: cd wa-gateway && node server.js")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down WhatsApp Notification Service...")


app = FastAPI(
    title="WhatsApp Notification Service",
    description="""
    API untuk mengirim notifikasi gangguan jaringan ke pelanggan melalui WhatsApp.
    
    ## Fitur
    
    - 📢 Kirim notifikasi gangguan ke semua pelanggan
    - 👤 Kirim notifikasi ke pelanggan tertentu
    - 🏢 Kirim notifikasi berdasarkan ODP
    - ✉️ Kirim pesan kustom
    - ⏭️ Otomatis skip pelanggan dengan nomor tidak valid (0)
    
    ## Konfigurasi WhatsApp
    
    Set environment variables berikut di file `.env`:
    - `WA_API_URL`: URL API WhatsApp gateway (Fonnte, Wablas, dll)
    - `WA_API_TOKEN`: Token autentikasi API
    - `WA_USE_MOCK`: Set ke `false` untuk mode produksi
    """,
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Sesuaikan untuk produksi
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(notifications_router)

# Debug: Print all routes on startup
@app.on_event("startup")
async def print_routes():
    print("\n📋 Registered Routes:")
    for route in app.routes:
        if hasattr(route, 'methods'):
            print(f"  {route.methods} {route.path}")


@app.get("/")
async def root():
    """
    Health check endpoint
    """
    return {
        "service": "WhatsApp Notification Service",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint dengan status WhatsApp
    """
    wa_status = await whatsapp_service.get_status()
    return {
        "status": "healthy",
        "whatsapp": wa_status
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
