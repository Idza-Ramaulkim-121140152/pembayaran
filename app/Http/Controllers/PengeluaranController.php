<?php

namespace App\Http\Controllers;

use App\Models\Pengeluaran;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PengeluaranController extends Controller
{
    public function index()
    {
        $pengeluarans = Pengeluaran::with('user')->orderByDesc('tanggal')->get();
        return view('pengeluaran.index', compact('pengeluarans'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'tanggal' => 'required|date',
            'jumlah' => ['required','regex:/^[0-9,]+$/'],
            'kategori' => 'required|string',
            'detail' => 'nullable|string',
        ]);
        // Hilangkan koma dari jumlah
        $validated['jumlah'] = (int)str_replace(',', '', $validated['jumlah']);
        $validated['user_id'] = Auth::id();
        Pengeluaran::create($validated);
        return redirect()->route('pengeluaran.index')->with('success', 'Pengeluaran berhasil dicatat.');
    }

    // API Methods for React
    public function apiIndex()
    {
        $pengeluarans = Pengeluaran::with('user')->orderByDesc('tanggal')->get();
        return response()->json(['data' => $pengeluarans]);
    }

    public function apiStore(Request $request)
    {
        $validated = $request->validate([
            'tanggal' => 'required|date',
            'jumlah' => ['required', 'regex:/^[0-9,]+$/'],
            'kategori' => 'required|string',
            'detail' => 'nullable|string',
        ]);
        
        $validated['jumlah'] = (int)str_replace(',', '', $validated['jumlah']);
        $validated['user_id'] = Auth::id();
        
        $pengeluaran = Pengeluaran::create($validated);
        $pengeluaran->load('user');
        
        return response()->json(['data' => $pengeluaran, 'message' => 'Pengeluaran berhasil dicatat'], 201);
    }

    public function apiUpdate(Request $request, Pengeluaran $pengeluaran)
    {
        $validated = $request->validate([
            'tanggal' => 'required|date',
            'jumlah' => ['required', 'regex:/^[0-9,]+$/'],
            'kategori' => 'required|string',
            'detail' => 'nullable|string',
        ]);
        
        $validated['jumlah'] = (int)str_replace(',', '', $validated['jumlah']);
        
        $pengeluaran->update($validated);
        $pengeluaran->load('user');
        
        return response()->json(['data' => $pengeluaran, 'message' => 'Pengeluaran berhasil diupdate']);
    }

    public function apiDestroy(Pengeluaran $pengeluaran)
    {
        $pengeluaran->delete();
        return response()->json(['message' => 'Pengeluaran berhasil dihapus']);
    }
}
