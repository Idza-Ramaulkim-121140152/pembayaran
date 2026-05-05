import apiClient from './api';

const masterWilayahService = {
    getHierarchy: () => apiClient.get('/master-wilayah'),
    getKecamatans: () => apiClient.get('/master-wilayah/kecamatan'),
    getDesas: (kecamatanId) => apiClient.get('/master-wilayah/desa', { params: { kecamatan_id: kecamatanId } }),
    getDusuns: (desaId) => apiClient.get('/master-wilayah/dusun', { params: { desa_id: desaId } }),

    createKecamatan: (payload) => apiClient.post('/master-wilayah/kecamatan', payload),
    updateKecamatan: (id, payload) => apiClient.put(`/master-wilayah/kecamatan/${id}`, payload),
    deleteKecamatan: (id) => apiClient.delete(`/master-wilayah/kecamatan/${id}`),

    createDesa: (payload) => apiClient.post('/master-wilayah/desa', payload),
    updateDesa: (id, payload) => apiClient.put(`/master-wilayah/desa/${id}`, payload),
    deleteDesa: (id) => apiClient.delete(`/master-wilayah/desa/${id}`),

    createDusun: (payload) => apiClient.post('/master-wilayah/dusun', payload),
    updateDusun: (id, payload) => apiClient.put(`/master-wilayah/dusun/${id}`, payload),
    deleteDusun: (id) => apiClient.delete(`/master-wilayah/dusun/${id}`),
};

export default masterWilayahService;
