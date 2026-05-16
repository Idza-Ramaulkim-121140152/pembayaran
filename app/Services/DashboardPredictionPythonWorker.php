<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

class DashboardPredictionPythonWorker
{
    private const DEFAULT_PYTHON_CANDIDATES = [
        'python3',
        'python',
        '/usr/bin/python3',
        '/usr/local/bin/python3',
    ];

    public function train(array $payload): array
    {
        return $this->runWorker('train', $payload);
    }

    public function snapshot(array $payload): array
    {
        return $this->runWorker('snapshot', $payload);
    }

    private function runWorker(string $mode, array $payload): array
    {
        $tmpDir = storage_path('app/prediction_worker');
        if (!File::exists($tmpDir)) {
            File::makeDirectory($tmpDir, 0755, true);
        }

        $requestFile = $tmpDir . '/request_' . $mode . '_' . uniqid('', true) . '.json';
        $responseFile = $tmpDir . '/response_' . $mode . '_' . uniqid('', true) . '.json';
        File::put($requestFile, json_encode($payload, JSON_PRETTY_PRINT));

        [$pythonBinary, $candidateList] = $this->resolvePythonBinary();
        $runnerPath = base_path('fastapi/prediction_worker/prediction_runner.py');
        $modelPath = storage_path('app/prediction_worker/model_artifact.json');

        if (!$pythonBinary) {
            return [
                'ok' => false,
                'error' => sprintf(
                    'Python binary tidak ditemukan. Kandidat: %s. Set env PREDICTION_PYTHON_BIN (contoh: python3 atau /path/to/venv/bin/python).',
                    implode(', ', $candidateList)
                ),
            ];
        }

        if (!File::exists($runnerPath)) {
            return [
                'ok' => false,
                'error' => sprintf('Python runner tidak ditemukan: %s', $runnerPath),
            ];
        }

        $process = new Process([
            $pythonBinary,
            $runnerPath,
            '--mode',
            $mode,
            '--input',
            $requestFile,
            '--output',
            $responseFile,
            '--model-path',
            $modelPath,
        ]);
        $process->setTimeout(240);
        $process->run();

        try {
            if (!$process->isSuccessful()) {
                return [
                    'ok' => false,
                    'error' => sprintf(
                        "Worker Python gagal (binary: %s, runner: %s). %s Hint: set env PREDICTION_PYTHON_BIN=python3 atau /path/to/venv/bin/python.",
                        $pythonBinary,
                        $runnerPath,
                        trim($process->getErrorOutput() ?: $process->getOutput()) ?: 'python_worker_failed'
                    ),
                ];
            }

            if (!File::exists($responseFile)) {
                return [
                    'ok' => false,
                    'error' => 'python_worker_no_output',
                ];
            }

            $decoded = json_decode((string) File::get($responseFile), true);
            if (!is_array($decoded)) {
                return [
                    'ok' => false,
                    'error' => 'python_worker_invalid_json',
                ];
            }

            return [
                'ok' => true,
                'data' => $decoded,
            ];
        } finally {
            File::delete([$requestFile, $responseFile]);
        }
    }

    private function resolvePythonBinary(): array
    {
        $envBinary = trim((string) env('PREDICTION_PYTHON_BIN', ''));
        $candidates = [];
        if ($envBinary !== '') {
            $candidates[] = $envBinary;
        }
        foreach (self::DEFAULT_PYTHON_CANDIDATES as $candidate) {
            if (!in_array($candidate, $candidates, true)) {
                $candidates[] = $candidate;
            }
        }

        foreach ($candidates as $candidate) {
            $resolved = $this->findExecutable($candidate);
            if ($resolved !== null) {
                return [$resolved, $candidates];
            }
        }

        return [null, $candidates];
    }

    private function findExecutable(string $candidate): ?string
    {
        if ($candidate === '') {
            return null;
        }

        if (str_contains($candidate, '/') || str_contains($candidate, '\\')) {
            if (!is_executable($candidate)) {
                return null;
            }
            return $this->isRunnablePython($candidate) ? $candidate : null;
        }

        $locator = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? 'where' : 'which';
        $process = new Process([$locator, $candidate]);
        $process->setTimeout(10);
        $process->run();

        if (!$process->isSuccessful()) {
            return null;
        }

        $output = trim($process->getOutput());
        if ($output === '') {
            return null;
        }

        $lines = preg_split('/\r\n|\r|\n/', $output);
        $first = is_array($lines) && isset($lines[0]) ? trim((string) $lines[0]) : '';

        if ($first === '') {
            return null;
        }

        return $this->isRunnablePython($first) ? $first : null;
    }

    private function isRunnablePython(string $binary): bool
    {
        try {
            $process = new Process([$binary, '--version']);
            $process->setTimeout(10);
            $process->run();

            return $process->isSuccessful();
        } catch (\Throwable) {
            return false;
        }
    }
}
