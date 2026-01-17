# Security Policy

## Security Fixes Implemented

This document outlines the security improvements made to the payment management system.

### Critical Fixes

#### 1. Hardcoded Credentials Removed
- **Issue**: MikroTik router credentials were hardcoded in `MikroTikService.php`
- **Fix**: Moved credentials to environment variables
- **Action Required**: Set the following environment variables in your `.env` file:
  ```
  MIKROTIK_HOST=your_mikrotik_host
  MIKROTIK_USER=your_mikrotik_user
  MIKROTIK_PASS=your_mikrotik_password
  MIKROTIK_PORT=8728
  MIKROTIK_TIMEOUT=5
  ```

#### 2. Authorization Checks Added
- **Issue**: Missing authorization checks on admin-only operations
- **Fix**: Added role-based access control for:
  - Payment confirmation via API
  - Payment rejection via API
  - Customer isolation operations
- **Impact**: Only authenticated admin users can perform these operations

#### 3. SQL Injection Prevention
- **Issue**: User search inputs were not sanitized, allowing potential SQL injection
- **Fix**: Added sanitization for wildcard characters in search queries across:
  - `BillingController`
  - `CustomerController`
  - `ComplaintController`
- **Protection**: Escapes `%` and `_` characters in LIKE queries

#### 4. Mass Assignment Protection
- **Issue**: User role field was mass assignable, allowing privilege escalation
- **Fix**: Removed `role` from fillable attributes and added to guarded array
- **Impact**: User roles can only be set explicitly, not through mass assignment

### High Priority Fixes

#### 5. File Upload Validation
- **Issue**: No validation on payment proof uploads
- **Fix**: Added validation for:
  - File type: Only JPG, PNG, and PDF allowed
  - File size: Maximum 5MB
- **Impact**: Prevents upload of malicious files

#### 6. Input Validation
- **Issue**: Invoice amount had weak validation
- **Fix**: Added proper validation with Laravel's validator:
  - Required field
  - Must be numeric
  - Minimum value: 1
  - Maximum value: 999,999,999
- **Impact**: Prevents invalid or malicious invoice amounts

#### 7. Rate Limiting
- **Issue**: No rate limiting on authentication endpoints
- **Fix**: Added throttling middleware:
  - Customer login: 5 attempts per minute
  - Admin login: 5 attempts per minute
  - Registration: 5 attempts per minute
- **Impact**: Protects against brute force attacks

## Known Security Considerations

### Customer Authentication
The customer authentication system uses phone number or PPPoE username without password. This is intentional for ease of use but has security implications:
- **Risk**: Anyone with a customer's phone number or username can access their account
- **Mitigation**: Consider implementing:
  - OTP (One-Time Password) via SMS
  - Password-based authentication
  - Two-factor authentication

### Public Invoice Access
Invoices are accessible via a unique link without authentication. While this provides convenience:
- **Risk**: Anyone with the link can view invoice details
- **Current Protection**: Links now use `Str::random(32)` which generates cryptographically secure random strings (implemented)
- **Status**: ✅ Fixed - Invoice links are now secure

## Security Best Practices

### For Developers
1. Never commit `.env` files
2. Keep dependencies updated
3. Use parameterized queries for all database operations
4. Validate and sanitize all user inputs
5. Use HTTPS in production
6. Enable CSRF protection for all state-changing operations
7. Regularly review and update security policies

### For System Administrators
1. Use strong passwords for all accounts
2. Keep MikroTik router credentials secure
3. Regularly backup database
4. Monitor logs for suspicious activity
5. Keep Laravel and PHP updated
6. Use firewall to restrict access to sensitive services
7. Implement regular security audits

## Reporting Security Issues

If you discover a security vulnerability, please email: [security contact email]

Please do not create public GitHub issues for security vulnerabilities.

## Security Checklist

- [x] Remove hardcoded credentials
- [x] Add authorization checks
- [x] Sanitize search inputs
- [x] Protect mass assignment
- [x] Validate file uploads
- [x] Add rate limiting
- [x] Use cryptographically secure random strings for invoice links
- [ ] Implement OTP for customer authentication
- [ ] Add HTTPS enforcement
- [ ] Implement audit logging
- [ ] Add database encryption for sensitive data
- [ ] Regular security penetration testing

## Last Updated
2026-01-17
