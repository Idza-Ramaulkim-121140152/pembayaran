<?php

namespace App\Services\Acs;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Support\Facades\Log;

class Tr069SoapEngine
{
    private const CWMP_NS = 'urn:dslforum-org:cwmp-1-0';
    private const SOAP_ENV_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
    private const SOAP_ENC_NS = 'http://schemas.xmlsoap.org/soap/encoding/';
    private const XSD_NS = 'http://www.w3.org/2001/XMLSchema';
    private const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';

    /**
     * Parse inbound TR-069 SOAP XML sent by CPE.
     */
    public function parseInboundXml(?string $xml): array
    {
        $result = [
            'type' => 'Empty',
            'cwmp_id' => '1',
            'device_id' => [],
            'events' => [],
            'parameters' => [],
            'parameter_types' => [],
            'fault' => null,
            'max_envelopes' => 1,
            'current_time' => null,
            'retry_count' => 0,
        ];

        if (empty($xml) || trim($xml) === '') {
            return $result;
        }

        try {
            $dom = new DOMDocument();
            // Suppress libxml warnings on malformed vendor XML
            libxml_use_internal_errors(true);
            $loaded = $dom->loadXML($xml, LIBXML_NONET | LIBXML_NOBLANKS);
            libxml_clear_errors();

            if (!$loaded) {
                Log::warning('Tr069SoapEngine: Failed to parse XML: ' . substr($xml, 0, 300));
                return $result;
            }

            $xpath = new DOMXPath($dom);
            // Register namespaces
            $xpath->registerNamespace('soap', self::SOAP_ENV_NS);
            $xpath->registerNamespace('cwmp', self::CWMP_NS);

            // Extract Header CWMP ID
            $idNodes = $xpath->query('//cwmp:ID | //ID');
            if ($idNodes && $idNodes->length > 0) {
                $result['cwmp_id'] = trim($idNodes->item(0)->textContent);
            }

            // Detect SOAP Body Method
            $bodyNodes = $xpath->query('//soap:Body/* | //Body/*');
            if (!$bodyNodes || $bodyNodes->length === 0) {
                return $result;
            }

            $methodNode = $bodyNodes->item(0);
            $methodName = $methodNode->localName ?? $methodNode->nodeName;

            // Handle namespaces in tag name like cwmp:Inform
            if (str_contains($methodName, ':')) {
                $parts = explode(':', $methodName);
                $methodName = end($parts);
            }

            $result['type'] = $methodName;

            switch ($methodName) {
                case 'Inform':
                    $this->parseInform($xpath, $methodNode, $result);
                    break;

                case 'SetParameterValuesResponse':
                    $statusNodes = $xpath->query('.//Status', $methodNode);
                    $result['status'] = $statusNodes && $statusNodes->length > 0 ? (int) $statusNodes->item(0)->textContent : 0;
                    break;

                case 'GetParameterValuesResponse':
                    $this->parseParameterList($xpath, $methodNode, $result);
                    break;

                case 'GetParameterNamesResponse':
                    $this->parseParameterNamesList($xpath, $methodNode, $result);
                    break;

                case 'RebootResponse':
                case 'FactoryResetResponse':
                case 'DownloadResponse':
                    $result['status'] = 0;
                    break;

                case 'GetRPCMethods':
                    $result['type'] = 'GetRPCMethods';
                    break;

                case 'TransferComplete':
                    $result['type'] = 'TransferComplete';
                    break;

                case 'Fault':
                    $codeNodes = $xpath->query('.//FaultCode | .//faultcode | .//cwmp:FaultCode', $methodNode);
                    $stringNodes = $xpath->query('.//FaultString | .//faultstring | .//cwmp:FaultString', $methodNode);
                    $result['fault'] = [
                        'code' => $codeNodes && $codeNodes->length > 0 ? trim($codeNodes->item(0)->textContent) : '9000',
                        'message' => $stringNodes && $stringNodes->length > 0 ? trim($stringNodes->item(0)->textContent) : 'CWMP Fault',
                    ];
                    break;
            }
        } catch (\Throwable $e) {
            Log::error('Tr069SoapEngine: Parse exception: ' . $e->getMessage());
        }

        return $result;
    }

    /**
     * Parse <cwmp:Inform> body
     */
    private function parseInform(DOMXPath $xpath, DOMElement $methodNode, array &$result): void
    {
        // 1. DeviceId
        $devIdNodes = $xpath->query('.//DeviceId | .//cwmp:DeviceId', $methodNode);
        if ($devIdNodes && $devIdNodes->length > 0) {
            $devNode = $devIdNodes->item(0);
            $mfr = $xpath->query('.//Manufacturer', $devNode)->item(0)?->textContent ?? '';
            $oui = $xpath->query('.//OUI', $devNode)->item(0)?->textContent ?? '';
            $prodClass = $xpath->query('.//ProductClass', $devNode)->item(0)?->textContent ?? '';
            $sn = $xpath->query('.//SerialNumber', $devNode)->item(0)?->textContent ?? '';

            $result['device_id'] = [
                'manufacturer' => trim((string)$mfr),
                'oui' => trim((string)$oui),
                'product_class' => trim((string)$prodClass),
                'serial_number' => trim((string)$sn),
            ];
        }

        // 2. Events
        $eventNodes = $xpath->query('.//Event/EventStruct | .//EventStruct', $methodNode);
        if ($eventNodes) {
            foreach ($eventNodes as $ev) {
                $code = $xpath->query('.//EventCode', $ev)->item(0)?->textContent;
                $cmdKey = $xpath->query('.//CommandKey', $ev)->item(0)?->textContent;
                if ($code !== null) {
                    $result['events'][] = [
                        'code' => trim($code),
                        'command_key' => $cmdKey ? trim($cmdKey) : null,
                    ];
                }
            }
        }

        // 3. MaxEnvelopes, CurrentTime, RetryCount
        $maxEnv = $xpath->query('.//MaxEnvelopes', $methodNode)->item(0)?->textContent;
        if ($maxEnv !== null) $result['max_envelopes'] = (int) $maxEnv;

        $cTime = $xpath->query('.//CurrentTime', $methodNode)->item(0)?->textContent;
        if ($cTime !== null) $result['current_time'] = trim($cTime);

        $retry = $xpath->query('.//RetryCount', $methodNode)->item(0)?->textContent;
        if ($retry !== null) $result['retry_count'] = (int) $retry;

        // 4. ParameterList
        $this->parseParameterList($xpath, $methodNode, $result);
    }

    /**
     * Parse ParameterValueStruct list into associative arrays
     */
    private function parseParameterList(DOMXPath $xpath, DOMElement $methodNode, array &$result): void
    {
        $paramNodes = $xpath->query('.//ParameterList/ParameterValueStruct | .//ParameterValueStruct', $methodNode);
        if ($paramNodes) {
            foreach ($paramNodes as $p) {
                $nameNode = $xpath->query('.//Name', $p)->item(0);
                $valueNode = $xpath->query('.//Value', $p)->item(0);

                if ($nameNode) {
                    $name = trim($nameNode->textContent);
                    $val = $valueNode ? $valueNode->textContent : '';
                    $type = $valueNode ? ($valueNode->getAttribute('xsi:type') ?: $valueNode->getAttribute('type') ?: 'xsd:string') : 'xsd:string';

                    $result['parameters'][$name] = $val;
                    $result['parameter_types'][$name] = $type;
                }
            }
        }
    }

    /**
     * Parse ParameterInfoStruct list from GetParameterNamesResponse
     */
    private function parseParameterNamesList(DOMXPath $xpath, DOMElement $methodNode, array &$result): void
    {
        $infoNodes = $xpath->query('.//ParameterList/ParameterInfoStruct | .//ParameterInfoStruct', $methodNode);
        $result['parameter_names'] = [];
        if ($infoNodes) {
            foreach ($infoNodes as $p) {
                $nameNode = $xpath->query('.//Name | .//name', $p)->item(0);
                $writableNode = $xpath->query('.//Writable | .//writable', $p)->item(0);

                if ($nameNode) {
                    $name = trim($nameNode->textContent);
                    $writable = $writableNode ? in_array(strtolower(trim($writableNode->textContent)), ['1', 'true'], true) : false;
                    $result['parameter_names'][$name] = $writable;
                }
            }
        }
    }

    /**
     * Build <cwmp:InformResponse>
     */
    public function buildInformResponse(string $cwmpId = '1', int $maxEnvelopes = 1): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
    <soapenv:Header>
        <cwmp:ID soapenv:mustUnderstand="1">{$cwmpId}</cwmp:ID>
    </soapenv:Header>
    <soapenv:Body>
        <cwmp:InformResponse>
            <MaxEnvelopes>{$maxEnvelopes}</MaxEnvelopes>
        </cwmp:InformResponse>
    </soapenv:Body>
</soapenv:Envelope>
XML;
    }

    /**
     * Build <cwmp:SetParameterValues>
     * @param array $parameters Map of parameter path => value (or ['value' => ..., 'type' => ...])
     */
    public function buildSetParameterValues(array $parameters, string $parameterKey = 'SetValueKey', string $cwmpId = '1'): string
    {
        $count = count($parameters);
        $paramListXml = '';

        foreach ($parameters as $name => $item) {
            $val = is_array($item) ? ($item['value'] ?? '') : $item;
            $type = is_array($item) ? ($item['type'] ?? 'xsd:string') : 'xsd:string';

            if (is_bool($val)) {
                $val = $val ? '1' : '0';
                $type = 'xsd:boolean';
            } elseif (is_int($val)) {
                $type = 'xsd:unsignedInt';
            }

            $escapedName = htmlspecialchars($name, ENT_XML1, 'UTF-8');
            $escapedVal = htmlspecialchars((string)$val, ENT_XML1, 'UTF-8');

            $paramListXml .= <<<XML
                <ParameterValueStruct>
                    <Name>{$escapedName}</Name>
                    <Value xsi:type="{$type}">{$escapedVal}</Value>
                </ParameterValueStruct>
XML;
        }

        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
    <soapenv:Header>
        <cwmp:ID soapenv:mustUnderstand="1">{$cwmpId}</cwmp:ID>
    </soapenv:Header>
    <soapenv:Body>
        <cwmp:SetParameterValues>
            <ParameterList soapenc:arrayType="cwmp:ParameterValueStruct[{$count}]">
{$paramListXml}
            </ParameterList>
            <ParameterKey>{$parameterKey}</ParameterKey>
        </cwmp:SetParameterValues>
    </soapenv:Body>
</soapenv:Envelope>
XML;
    }

    /**
     * Build <cwmp:GetParameterValues>
     * @param array $parameterNames Array of parameter paths (or partial paths ending in '.')
     */
    public function buildGetParameterValues(array $parameterNames, string $cwmpId = '1'): string
    {
        $count = count($parameterNames);
        $namesXml = '';

        foreach ($parameterNames as $name) {
            $escaped = htmlspecialchars($name, ENT_XML1, 'UTF-8');
            $namesXml .= "                <string>{$escaped}</string>\n";
        }

        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
    <soapenv:Header>
        <cwmp:ID soapenv:mustUnderstand="1">{$cwmpId}</cwmp:ID>
    </soapenv:Header>
    <soapenv:Body>
        <cwmp:GetParameterValues>
            <ParameterNames soapenc:arrayType="xsd:string[{$count}]">
{$namesXml}
            </ParameterNames>
        </cwmp:GetParameterValues>
    </soapenv:Body>
</soapenv:Envelope>
XML;
    }

    /**
     * Build <cwmp:GetParameterNames>
     */
    public function buildGetParameterNames(string $parameterPath = 'InternetGatewayDevice.', bool $nextLevel = false, string $cwmpId = '1'): string
    {
        $escaped = htmlspecialchars($parameterPath, ENT_XML1, 'UTF-8');
        $nextLevelStr = $nextLevel ? '1' : '0';

        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
    <soapenv:Header>
        <cwmp:ID soapenv:mustUnderstand="1">{$cwmpId}</cwmp:ID>
    </soapenv:Header>
    <soapenv:Body>
        <cwmp:GetParameterNames>
            <ParameterPath>{$escaped}</ParameterPath>
            <NextLevel>{$nextLevelStr}</NextLevel>
        </cwmp:GetParameterNames>
    </soapenv:Body>
</soapenv:Envelope>
XML;
    }

    /**
     * Build <cwmp:Reboot>
     */
    public function buildReboot(string $commandKey = 'Reboot', string $cwmpId = '1'): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
    <soapenv:Header>
        <cwmp:ID soapenv:mustUnderstand="1">{$cwmpId}</cwmp:ID>
    </soapenv:Header>
    <soapenv:Body>
        <cwmp:Reboot>
            <CommandKey>{$commandKey}</CommandKey>
        </cwmp:Reboot>
    </soapenv:Body>
</soapenv:Envelope>
XML;
    }

    /**
     * Build <cwmp:FactoryReset>
     */
    public function buildFactoryReset(string $cwmpId = '1'): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
    <soapenv:Header>
        <cwmp:ID soapenv:mustUnderstand="1">{$cwmpId}</cwmp:ID>
    </soapenv:Header>
    <soapenv:Body>
        <cwmp:FactoryReset/>
    </soapenv:Body>
</soapenv:Envelope>
XML;
    }

    /**
     * Build <cwmp:GetRPCMethodsResponse>
     */
    public function buildGetRpcMethodsResponse(string $cwmpId = '1'): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
    <soapenv:Header>
        <cwmp:ID soapenv:mustUnderstand="1">{$cwmpId}</cwmp:ID>
    </soapenv:Header>
    <soapenv:Body>
        <cwmp:GetRPCMethodsResponse>
            <MethodList soapenc:arrayType="xsd:string[6]">
                <string>Inform</string>
                <string>GetRPCMethods</string>
                <string>SetParameterValues</string>
                <string>GetParameterValues</string>
                <string>Reboot</string>
                <string>FactoryReset</string>
            </MethodList>
        </cwmp:GetRPCMethodsResponse>
    </soapenv:Body>
</soapenv:Envelope>
XML;
    }

    /**
     * Build CWMP SOAP Fault
     */
    public function buildFault(int $faultCode = 9002, string $faultString = 'Internal error', string $cwmpId = '1'): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
    <soapenv:Header>
        <cwmp:ID soapenv:mustUnderstand="1">{$cwmpId}</cwmp:ID>
    </soapenv:Header>
    <soapenv:Body>
        <soapenv:Fault>
            <faultcode>Server</faultcode>
            <faultstring>CWMP fault</faultstring>
            <detail>
                <cwmp:Fault>
                    <FaultCode>{$faultCode}</FaultCode>
                    <FaultString>{$faultString}</FaultString>
                </cwmp:Fault>
            </detail>
        </soapenv:Fault>
    </soapenv:Body>
</soapenv:Envelope>
XML;
    }
}
