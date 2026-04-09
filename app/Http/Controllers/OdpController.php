<?php

namespace App\Http\Controllers;

use App\Models\Odp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class OdpController extends Controller
{
    public function index()
    {
        $odps = Odp::withCount(['customers'])->orderBy('nama')->get();
        return view('odp.index', compact('odps'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'nama' => 'required|string|unique:odps,nama',
            'rasio_spesial' => 'nullable|string',
            'rasio_distribusi' => 'required|in:1:2,1:4,1:8,1:16',
            'foto' => 'nullable|image|max:2048',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
        ]);
        if ($request->hasFile('foto')) {
            $validated['foto'] = $request->file('foto')->store('uploads/odp', 'public');
        }
        Odp::create($validated);
        return redirect()->route('odp.index')->with('success', 'ODP berhasil ditambahkan.');
    }

    public function edit(Odp $odp)
    {
        return view('odp.edit', compact('odp'));
    }

    public function update(Request $request, Odp $odp)
    {
        $oldName = $odp->nama;
        $validated = $request->validate([
            'nama' => 'required|string|unique:odps,nama,' . $odp->id,
            'rasio_spesial' => 'nullable|string',
            'rasio_distribusi' => 'required|in:1:2,1:4,1:8,1:16',
            'foto' => 'nullable|image|max:2048',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
        ]);
        if ($request->hasFile('foto')) {
            if ($odp->foto) Storage::disk('public')->delete($odp->foto);
            $validated['foto'] = $request->file('foto')->store('uploads/odp', 'public');
        }
        $odp->update($validated);

        if ($oldName !== $odp->nama) {
            
            
            
            \App\Models\Customer::where('odp', $oldName)->update(['odp' => $odp->nama]);
        }
        return redirect()->route('odp.index')->with('success', 'ODP berhasil diupdate.');
    }

    public function show(Odp $odp)
    {
        $odp->load('customers');
        return view('odp.show', compact('odp'));
    }

    // API Methods for React
    public function apiIndex()
    {
        $odps = Odp::withCount(['customers'])->orderBy('nama')->get();
        return response()->json(['data' => $odps]);
    }

    public function apiStore(Request $request)
    {
        $validated = $request->validate([
            'nama' => 'required|string|unique:odps,nama',
            'rasio_spesial' => 'nullable|string',
            'rasio_distribusi' => 'required|in:1:2,1:4,1:8,1:16',
            'foto' => 'nullable|image|max:2048',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
        ]);
        
        if ($request->hasFile('foto')) {
            $validated['foto'] = $request->file('foto')->store('uploads/odp', 'public');
        }
        
        $odp = Odp::create($validated);
        return response()->json(['data' => $odp, 'message' => 'ODP berhasil ditambahkan'], 201);
    }

    public function apiShow(Odp $odp)
    {
        $odp->load(['customers' => function ($query) {
            $query->orderBy('name');
        }]);
        $odp->loadCount('customers');
        return response()->json(['data' => $odp]);
    }

    public function apiUpdate(Request $request, Odp $odp)
    {
        $oldName = $odp->nama;
        $validated = $request->validate([
            'nama' => 'required|string|unique:odps,nama,' . $odp->id,
            'rasio_spesial' => 'nullable|string',
            'rasio_distribusi' => 'required|in:1:2,1:4,1:8,1:16',
            'foto' => 'nullable|image|max:2048',
            'latitude' => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
        ]);
        
        if ($request->hasFile('foto')) {
            if ($odp->foto) Storage::disk('public')->delete($odp->foto);
            $validated['foto'] = $request->file('foto')->store('uploads/odp', 'public');
        }
        
        $odp->update($validated);

        if ($oldName !== $odp->nama) {
            \App\Models\Customer::where('odp', $oldName)->update(['odp' => $odp->nama]);
        }

        return response()->json(['data' => $odp, 'message' => 'ODP berhasil diupdate']);
    }

    public function apiCustomers(Odp $odp)
    {
        $customers = \App\Models\Customer::where('odp', $odp->nama)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $customers]);
    }

    public function apiAttachCustomer(Request $request, Odp $odp)
    {
        $validated = $request->validate([
            'customer_id' => 'required|integer|exists:customers,id',
        ]);

        $customer = \App\Models\Customer::findOrFail($validated['customer_id']);
        $customer->odp = $odp->nama;
        $customer->save();

        return response()->json([
            'message' => 'Pelanggan berhasil ditambahkan ke ODP',
            'data' => $customer,
        ]);
    }

    public function apiDetachCustomer(Request $request, Odp $odp)
    {
        $validated = $request->validate([
            'customer_id' => 'required|integer|exists:customers,id',
        ]);

        $customer = \App\Models\Customer::findOrFail($validated['customer_id']);
        if ($customer->odp === $odp->nama) {
            $customer->odp = null;
            $customer->save();
        }

        return response()->json([
            'message' => 'Pelanggan berhasil dihapus dari ODP',
            'data' => $customer,
        ]);
    }

    public function apiDestroy(Odp $odp)
    {
        if ($odp->foto) {
            Storage::disk('public')->delete($odp->foto);
        }

        \App\Models\Customer::where('odp', $odp->nama)->update(['odp' => null]);

        $odp->delete();
        return response()->json(['message' => 'ODP berhasil dihapus']);
    }
}
