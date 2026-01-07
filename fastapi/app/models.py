from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean, Text
from sqlalchemy.sql import func
from app.database import Base

class Customer(Base):
    __tablename__ = "customers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=False)
    email = Column(String(255), nullable=True)
    due_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    activation_date = Column(Date, nullable=True)
    nik = Column(String(50), nullable=True)
    gender = Column(String(10), nullable=True)
    address = Column(Text, nullable=True)
    package_type = Column(String(100), nullable=True)
    custom_package = Column(String(100), nullable=True)
    pppoe_username = Column(String(100), nullable=True)
    odp = Column(String(100), nullable=True)
    installation_fee = Column(Integer, nullable=True)
    latitude = Column(String(50), nullable=True)
    longitude = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class NetworkNotice(Base):
    __tablename__ = "network_notices"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(20), default="gangguan")  # gangguan, maintenance
    severity = Column(String(20), default="medium")  # low, medium, high, critical
    is_mass = Column(Boolean, default=False)
    affected_area = Column(String(255), nullable=True)
    affected_odp = Column(String(255), nullable=True)  # comma separated
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
