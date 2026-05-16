<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

class DashboardPredictionPythonWorker
{
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

        $pythonBinary = env('PREDICTION_PYTHON_BIN', 'python');
        $runnerPath = base_path('fastapi/prediction_worker/prediction_runner.py');
        $modelPath = storage_path('app/prediction_worker/model_artifact.json');

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
                    'error' => trim($process->getErrorOutput() ?: $process->getOutput()) ?: 'python_worker_failed',
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
}

