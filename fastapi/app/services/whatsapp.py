import asyncio
import re
import base64
from typing import Optional
from pathlib import Path
import aiohttp

from app.config import settings


class WhatsAppService:
    """
    WhatsApp Service yang berkomunikasi dengan Node.js WhatsApp Gateway
    menggunakan whatsapp-web.js (GRATIS)
    
    Gateway berjalan di port 3001 secara default
    """
    
    def __init__(self):
        self.gateway_url = settings.WA_GATEWAY_URL
        self.connected = False
        self.phone_number = None
    
    async def _request(self, method: str, endpoint: str, data: dict = None) -> dict:
        """
        Helper untuk request ke WhatsApp Gateway
        """
        url = f"{self.gateway_url}{endpoint}"
        
        try:
            async with aiohttp.ClientSession() as session:
                if method == "GET":
                    async with session.get(url) as response:
                        return await response.json()
                else:
                    async with session.post(url, json=data) as response:
                        return await response.json()
        except aiohttp.ClientError as e:
            return {
                "success": False,
                "error": f"Gateway tidak tersedia: {str(e)}. Pastikan wa-gateway sudah berjalan di {self.gateway_url}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def normalize_phone(self, phone: str) -> str:
        """
        Normalize phone number ke format internasional Indonesia
        """
        if not phone:
            return ""
        
        phone = re.sub(r'\D', '', phone)
        
        if not phone or phone == "0":
            return ""
        
        if phone.startswith('0'):
            phone = '62' + phone[1:]
        elif phone.startswith('8'):
            phone = '62' + phone
        elif not phone.startswith('62'):
            phone = '62' + phone
            
        return phone
    
    def is_valid_phone(self, phone: str) -> bool:
        """
        Validasi nomor telepon
        """
        if not phone or phone == "0":
            return False
        
        normalized = self.normalize_phone(phone)
        if len(normalized) < 10 or len(normalized) > 15:
            return False
        
        return True
    
    async def connect(self) -> dict:
        """
        Cek koneksi ke WhatsApp Gateway
        """
        result = await self._request("GET", "/status")
        
        if result.get("ready"):
            self.connected = True
            self.phone_number = result.get("phone")
            return {
                "success": True,
                "message": f"WhatsApp terhubung sebagai {self.phone_number}"
            }
        elif result.get("hasQR"):
            return {
                "success": False,
                "message": "WhatsApp belum login. Silakan scan QR code di /api/whatsapp/qr"
            }
        else:
            return {
                "success": False,
                "message": result.get("error", "WhatsApp Gateway tidak tersedia")
            }
    
    async def get_status(self) -> dict:
        """
        Cek status koneksi WhatsApp
        """
        result = await self._request("GET", "/status")
        
        self.connected = result.get("ready", False)
        self.phone_number = result.get("phone")
        
        return {
            "connected": self.connected,
            "phone_number": self.phone_number,
            "has_qr": result.get("hasQR", False),
            "error": result.get("error"),
            "gateway_url": self.gateway_url
        }
    
    async def get_qr(self) -> dict:
        """
        Ambil QR Code untuk login WhatsApp
        """
        return await self._request("GET", "/qr")
    
    async def send_message(self, phone: str, message: str) -> dict:
        """
        Kirim pesan WhatsApp ke nomor tertentu
        """
        if not self.is_valid_phone(phone):
            return {
                "success": False,
                "phone": phone,
                "error": "Nomor telepon tidak valid atau 0"
            }
        
        result = await self._request("POST", "/send", {
            "phone": phone,
            "message": message
        })
        
        return result
    
    async def send_bulk(self, recipients: list, message: str, delay: float = 2.0) -> list:
        """
        Kirim pesan ke banyak nomor via gateway
        """
        # Filter nomor yang tidak valid terlebih dahulu
        valid_recipients = []
        results = []
        
        for recipient in recipients:
            phone = recipient.get('phone', '')
            name = recipient.get('name', 'Pelanggan')
            
            if not self.is_valid_phone(phone):
                results.append({
                    "phone": phone,
                    "customer_name": name,
                    "success": False,
                    "error": "Nomor tidak valid atau 0"
                })
            else:
                valid_recipients.append(recipient)
        
        # Kirim ke gateway untuk nomor yang valid
        if valid_recipients:
            gateway_result = await self._request("POST", "/send-bulk", {
                "recipients": valid_recipients,
                "message": message,
                "delay": int(delay * 1000)  # Convert to milliseconds
            })
            
            if gateway_result.get("results"):
                results.extend(gateway_result["results"])
            elif gateway_result.get("error"):
                # Jika gateway error, tandai semua sebagai gagal
                for recipient in valid_recipients:
                    results.append({
                        "phone": recipient.get('phone', ''),
                        "customer_name": recipient.get('name', 'Pelanggan'),
                        "success": False,
                        "error": gateway_result.get("error")
                    })
        
        return results
    
    async def restart(self) -> dict:
        """
        Restart WhatsApp client
        """
        return await self._request("POST", "/restart")
    
    async def logout(self) -> dict:
        """
        Logout dari WhatsApp
        """
        return await self._request("POST", "/logout")


# Singleton instance
whatsapp_service = WhatsAppService()
