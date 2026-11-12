<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class WhatsAppGatewayService
{
    public function baseUrl(): string
    {
        return rtrim((string) config('services.wa_gateway.url', 'http://localhost:3001'), '/');
    }

    public function secret(): string
    {
        return trim((string) config('services.wa_gateway.secret', ''));
    }

    public function url(string $path): string
    {
        return $this->baseUrl() . '/' . ltrim($path, '/');
    }

    public function client(int $timeout = 30): PendingRequest
    {
        $client = Http::timeout($timeout);
        $secret = $this->secret();

        if ($secret !== '') {
            $client = $client->withHeaders([
                'X-Gateway-Secret' => $secret,
            ]);
        }

        return $client;
    }

    public function get(string $path, array $query = [], int $timeout = 10): Response
    {
        return $this->client($timeout)->get($this->url($path), $query);
    }

    public function post(string $path, array $payload = [], int $timeout = 30): Response
    {
        return $this->client($timeout)->post($this->url($path), $payload);
    }

    public function send(string $phone, string $message, ?string $name = null, int $timeout = 30): Response
    {
        $payload = [
            'phone' => $phone,
            'message' => $message,
        ];

        if ($name !== null && $name !== '') {
            $payload['name'] = $name;
        }

        return $this->post('/send', $payload, $timeout);
    }

    public function sendBulk(array $recipients, string $message, int $delay = 0, int $timeout = 60): Response
    {
        return $this->post('/send-bulk', [
            'recipients' => $recipients,
            'message' => $message,
            'delay' => $delay,
        ], $timeout);
    }
}
