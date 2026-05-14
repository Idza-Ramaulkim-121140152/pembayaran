import apiClient from './api';

const accessControlService = {
    me: () => apiClient.get('/access-control/me'),
    users: () => apiClient.get('/users'),
    permissions: () => apiClient.get('/access-control/permissions'),
    menuMap: () => apiClient.get('/access-control/menu-map'),
    groups: (params = {}) => apiClient.get('/access-control/groups', { params }),
    createGroup: (payload) => apiClient.post('/access-control/groups', payload),
    updateGroup: (groupId, payload) => apiClient.put(`/access-control/groups/${groupId}`, payload),
    deleteGroup: (groupId) => apiClient.delete(`/access-control/groups/${groupId}`),
    updateGroupMembers: (groupId, userIds) => apiClient.post(`/access-control/groups/${groupId}/members`, { user_ids: userIds }),
    roleRules: (role) => apiClient.get(`/access-control/roles/${role}/rules`),
    updateRoleRules: (role, rules) => apiClient.put(`/access-control/roles/${role}/rules`, { rules }),
    groupRules: (groupId) => apiClient.get(`/access-control/groups/${groupId}/rules`),
    updateGroupRules: (groupId, rules) => apiClient.put(`/access-control/groups/${groupId}/rules`, { rules }),
    userRules: (userId) => apiClient.get(`/access-control/users/${userId}/rules`),
    updateUserRules: (userId, rules) => apiClient.put(`/access-control/users/${userId}/rules`, { rules }),
    userEffective: (userId) => apiClient.get(`/access-control/users/${userId}/effective`),
    effectivePreview: (targetType, target) =>
        apiClient.get('/access-control/effective-preview', { params: { target_type: targetType, target } }),
    auditLogs: (params = {}) => apiClient.get('/access-control/audit-logs', { params }),
};

export default accessControlService;
