import { useEffect, useMemo, useRef, useState } from 'react';
import {
    CheckCircle2,
    Layers3,
    RefreshCcw,
    ShieldCheck,
    Sparkles,
    Users2,
    XCircle,
} from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import accessControlService from '../../services/accessControlService';

const ROLES = ['superadmin', 'admin', 'teknisi', 'finance'];
const TARGET_TYPES = ['role', 'group', 'user'];
const OPERATIONAL_SECTIONS = ['main', 'operations'];

const fallbackMenuMapFromPermissions = (rows) =>
    (rows || []).map((permission) => ({
        menu_key: permission.key,
        label: permission.label || permission.key,
        permission_keys: [permission.key],
        navbar_section: 'advanced',
        default_visible: true,
    }));

function AccessPolicyPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [targetLoading, setTargetLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [permissions, setPermissions] = useState([]);
    const [menuMap, setMenuMap] = useState([]);
    const [groups, setGroups] = useState([]);
    const [users, setUsers] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);

    const [targetType, setTargetType] = useState('role');
    const [selectedRole, setSelectedRole] = useState('admin');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');

    const [roleEffects, setRoleEffects] = useState({});
    const [groupEffects, setGroupEffects] = useState({});
    const [userEffects, setUserEffects] = useState({});
    const [roleInitialEffects, setRoleInitialEffects] = useState({});
    const [groupInitialEffects, setGroupInitialEffects] = useState({});
    const [userInitialEffects, setUserInitialEffects] = useState({});
    const [groupMembers, setGroupMembers] = useState([]);

    const [targetEffectiveRows, setTargetEffectiveRows] = useState([]);
    const [effectiveRows, setEffectiveRows] = useState([]);
    const [newGroup, setNewGroup] = useState({ name: '', slug: '', description: '' });
    const targetRequestRef = useRef(0);
    const previewRequestRef = useRef(0);

    const permissionKeyToId = useMemo(() => {
        const map = {};
        permissions.forEach((permission) => {
            map[permission.key] = permission.id;
        });
        return map;
    }, [permissions]);

    const permissionIdToKey = useMemo(() => {
        const map = {};
        permissions.forEach((permission) => {
            map[permission.id] = permission.key;
        });
        return map;
    }, [permissions]);

    const selectedUser = useMemo(
        () => users.find((user) => String(user.id) === String(selectedUserId)),
        [users, selectedUserId]
    );

    const activeEffects = useMemo(() => {
        if (targetType === 'group') return groupEffects;
        if (targetType === 'user') return userEffects;
        return roleEffects;
    }, [targetType, roleEffects, groupEffects, userEffects]);

    const initialEffects = useMemo(() => {
        if (targetType === 'group') return groupInitialEffects;
        if (targetType === 'user') return userInitialEffects;
        return roleInitialEffects;
    }, [targetType, roleInitialEffects, groupInitialEffects, userInitialEffects]);

    const setActiveEffects = (updater) => {
        if (targetType === 'group') {
            setGroupEffects(updater);
            return;
        }
        if (targetType === 'user') {
            setUserEffects(updater);
            return;
        }
        setRoleEffects(updater);
    };

    const selectedTargetLabel = useMemo(() => {
        if (targetType === 'group') {
            const group = groups.find((item) => String(item.id) === String(selectedGroupId));
            return group ? `Grup: ${group.name}` : 'Grup belum dipilih';
        }
        if (targetType === 'user') {
            return selectedUser ? `User: ${selectedUser.name}` : 'User belum dipilih';
        }
        return `Role: ${selectedRole}`;
    }, [targetType, groups, selectedGroupId, selectedUser, selectedRole]);

    useEffect(() => {
        loadInitial();
    }, []);

    useEffect(() => {
        if (targetType !== 'role') return;
        refreshRoleTarget(selectedRole);
    }, [targetType, selectedRole]);

    useEffect(() => {
        if (targetType !== 'group' || !selectedGroupId) return;
        refreshGroupTarget(selectedGroupId);
    }, [targetType, selectedGroupId]);

    useEffect(() => {
        if (!selectedUserId) return;
        loadUserEffective(selectedUserId).catch(() => {
            setError('Gagal memuat preview effective user.');
        });
    }, [selectedUserId]);

    useEffect(() => {
        if (targetType !== 'user' || !selectedUserId) return;
        refreshUserTarget(selectedUserId);
    }, [targetType, selectedUserId]);

    const loadInitial = async () => {
        try {
            setLoading(true);
            setError(null);

            const [permissionsReq, menuMapReq, groupsReq, usersReq, logsReq] = await Promise.allSettled([
                accessControlService.permissions(),
                accessControlService.menuMap(),
                accessControlService.groups({ per_page: 100 }),
                accessControlService.users(),
                accessControlService.auditLogs({ per_page: 20 }),
            ]);

            if (permissionsReq.status !== 'fulfilled') {
                throw new Error('permissions_failed');
            }
            if (groupsReq.status !== 'fulfilled' || usersReq.status !== 'fulfilled' || logsReq.status !== 'fulfilled') {
                throw new Error('master_failed');
            }

            const permissionsRows = permissionsReq.value?.data?.data || [];
            const menuRows = menuMapReq.status === 'fulfilled'
                ? (menuMapReq.value?.data?.data || [])
                : fallbackMenuMapFromPermissions(permissionsRows);
            const groupRows = groupsReq.value?.data?.data?.data || [];
            const userRows = usersReq.value?.data?.data || [];

            setPermissions(permissionsRows);
            setMenuMap(menuRows);
            setGroups(groupRows);
            setUsers(userRows);
            setAuditLogs(logsReq.value?.data?.data?.data || []);

            if (groupRows[0]) {
                setSelectedGroupId(String(groupRows[0].id));
            }
            if (userRows[0]) {
                setSelectedUserId(String(userRows[0].id));
            }
        } catch (err) {
            setError('Gagal memuat data access policy.');
        } finally {
            setLoading(false);
        }
    };

    const loadRoleRules = async (role) => {
        const response = await accessControlService.roleRules(role);
        const next = {};
        (response?.data?.data || []).forEach((rule) => {
            next[rule.permission_key_id] = rule.effect;
        });
        setRoleEffects(next);
        setRoleInitialEffects(next);
    };

    const loadGroupRules = async (groupId) => {
        const response = await accessControlService.groupRules(groupId);
        const next = {};
        (response?.data?.data || []).forEach((rule) => {
            next[rule.permission_key_id] = rule.effect;
        });
        setGroupEffects(next);
        setGroupInitialEffects(next);

        const group = groups.find((item) => String(item.id) === String(groupId));
        setGroupMembers(group?.members?.map((member) => member.id) || []);
    };

    const loadUserRules = async (userId) => {
        const response = await accessControlService.userRules(userId);
        const next = {};
        (response?.data?.data || []).forEach((rule) => {
            next[rule.permission_key_id] = rule.effect;
        });
        setUserEffects(next);
        setUserInitialEffects(next);
    };

    const loadUserEffective = async (userId) => {
        const requestId = ++previewRequestRef.current;
        const response = await accessControlService.userEffective(userId);
        if (requestId !== previewRequestRef.current) return;
        setEffectiveRows(response?.data?.data?.effective_permissions || []);
    };

    const loadTargetEffective = async (type, target) => {
        const requestId = ++targetRequestRef.current;
        setTargetLoading(true);
        try {
            const response = await accessControlService.effectivePreview(type, target);
            if (requestId !== targetRequestRef.current) return;
            setTargetEffectiveRows(response?.data?.data?.effective_permissions || []);
        } finally {
            if (requestId === targetRequestRef.current) {
                setTargetLoading(false);
            }
        }
    };

    const refreshRoleTarget = async (role) => {
        try {
            setError(null);
            await Promise.all([loadRoleRules(role), loadTargetEffective('role', role)]);
        } catch (err) {
            setError('Gagal memuat role policy.');
            setTargetLoading(false);
        }
    };

    const refreshGroupTarget = async (groupId) => {
        try {
            setError(null);
            await Promise.all([loadGroupRules(groupId), loadTargetEffective('group', groupId)]);
        } catch (err) {
            setError('Gagal memuat group policy.');
            setTargetLoading(false);
        }
    };

    const refreshUserTarget = async (userId) => {
        try {
            setError(null);
            await Promise.all([loadUserRules(userId), loadTargetEffective('user', userId)]);
        } catch (err) {
            setError('Gagal memuat user policy.');
            setTargetLoading(false);
        }
    };

    const buildRulesPayload = (effectsMap) => {
        return permissions.map((permission) => ({
            permission_key_id: permission.id,
            effect: effectsMap[permission.id] || 'inherited',
        }));
    };

    const saveActiveTargetRules = async () => {
        try {
            setSaving(true);
            setError(null);
            const payload = buildRulesPayload(activeEffects);

            if (targetType === 'role') {
                await accessControlService.updateRoleRules(selectedRole, payload);
                await refreshRoleTarget(selectedRole);
                setSuccess(`Role ${selectedRole} berhasil disimpan.`);
            } else if (targetType === 'group') {
                if (!selectedGroupId) {
                    setError('Pilih grup terlebih dahulu.');
                    return;
                }
                await accessControlService.updateGroupRules(selectedGroupId, payload);
                await accessControlService.updateGroupMembers(selectedGroupId, groupMembers);
                setSuccess('Rules dan anggota grup berhasil disimpan.');
                await refreshGroups();
                await refreshGroupTarget(selectedGroupId);
            } else {
                if (!selectedUserId) {
                    setError('Pilih user terlebih dahulu.');
                    return;
                }
                await accessControlService.updateUserRules(selectedUserId, payload);
                setSuccess('Override user berhasil disimpan.');
                await refreshUserTarget(selectedUserId);
            }

            if (selectedUserId) {
                await loadUserEffective(selectedUserId);
            }
            const logs = await accessControlService.auditLogs({ per_page: 20 });
            setAuditLogs(logs?.data?.data?.data || []);
        } catch (err) {
            setError(err?.response?.data?.message || 'Gagal menyimpan rules.');
        } finally {
            setSaving(false);
        }
    };

    const refreshGroups = async () => {
        const response = await accessControlService.groups({ per_page: 100 });
        const rows = response?.data?.data?.data || [];
        setGroups(rows);

        if (selectedGroupId && !rows.find((item) => String(item.id) === String(selectedGroupId))) {
            setSelectedGroupId(rows[0] ? String(rows[0].id) : '');
        }
    };

    const createGroup = async (event) => {
        event.preventDefault();
        if (!newGroup.name.trim()) {
            setError('Nama grup wajib diisi.');
            return;
        }

        try {
            setSaving(true);
            await accessControlService.createGroup(newGroup);
            setNewGroup({ name: '', slug: '', description: '' });
            setSuccess('Grup berhasil dibuat.');
            await refreshGroups();
        } catch (err) {
            setError(err?.response?.data?.message || 'Gagal membuat grup.');
        } finally {
            setSaving(false);
        }
    };

    const deleteGroup = async () => {
        if (!selectedGroupId) return;
        if (!window.confirm('Hapus grup terpilih?')) return;

        try {
            setSaving(true);
            await accessControlService.deleteGroup(selectedGroupId);
            setSuccess('Grup berhasil dihapus.');
            await refreshGroups();
        } catch (err) {
            setError(err?.response?.data?.message || 'Gagal menghapus grup.');
        } finally {
            setSaving(false);
        }
    };

    const toggleMember = (userId) => {
        setGroupMembers((prev) => {
            if (prev.includes(userId)) return prev.filter((id) => id !== userId);
            return [...prev, userId];
        });
    };

    const getMenuState = (menu) => {
        const permissionIds = (menu.permission_keys || [])
            .map((key) => permissionKeyToId[key])
            .filter(Boolean);
        if (permissionIds.length === 0) return { status: 'inherited', source: '-', pending: false };

        const hasPending = permissionIds.some((id) => {
            const current = activeEffects[id] || 'inherited';
            const baseline = initialEffects[id] || 'inherited';
            return current !== baseline;
        });

        if (hasPending) {
            const effects = permissionIds.map((id) => activeEffects[id] || 'inherited');
            if (effects.every((effect) => effect === 'allow')) {
                return { status: 'allow', source: 'pending_change', pending: true };
            }
            if (effects.some((effect) => effect === 'deny')) {
                return { status: 'deny', source: 'pending_change', pending: true };
            }
            return { status: 'inherited', source: 'pending_change', pending: true };
        }

        const keys = permissionIds.map((id) => permissionIdToKey[id]).filter(Boolean);
        const rows = keys.map((key) => effectiveByKey[key]).filter(Boolean);

        if (!rows.length) return { status: 'inherited', source: '-', pending: false };

        const allowed = rows.every((row) => !!row.allowed);
        const sourceValues = [...new Set(rows.map((row) => row.source || '-'))];

        return {
            status: allowed ? 'allow' : 'deny',
            source: sourceValues.length === 1 ? sourceValues[0] : 'mixed',
            pending: false,
        };
    };

    const setMenuToggle = (menu, checked) => {
        const effect = checked ? 'allow' : 'deny';
        const permissionIds = (menu.permission_keys || [])
            .map((key) => permissionKeyToId[key])
            .filter(Boolean);
        if (permissionIds.length === 0) return;

        setActiveEffects((prev) => {
            const next = { ...prev };
            permissionIds.forEach((id) => {
                next[id] = effect;
            });
            return next;
        });
    };

    const applyBulkOperationalOn = () => {
        const operationalMenus = menuMap.filter((menu) => OPERATIONAL_SECTIONS.includes(menu.navbar_section));
        setActiveEffects((prev) => {
            const next = { ...prev };
            operationalMenus.forEach((menu) => {
                (menu.permission_keys || []).forEach((key) => {
                    const permissionId = permissionKeyToId[key];
                    if (permissionId) next[permissionId] = 'allow';
                });
            });
            return next;
        });
    };

    const applyBulkAllOff = () => {
        setActiveEffects((prev) => {
            const next = { ...prev };
            permissions.forEach((permission) => {
                next[permission.id] = 'deny';
            });
            return next;
        });
    };

    const applyResetBaseline = () => {
        setActiveEffects((prev) => {
            const next = { ...prev };
            permissions.forEach((permission) => {
                next[permission.id] = 'inherited';
            });
            return next;
        });
    };

    const effectiveByKey = useMemo(() => {
        const map = {};
        targetEffectiveRows.forEach((row) => {
            map[row.permission_key] = row;
        });
        return map;
    }, [targetEffectiveRows]);

    const previewEffectiveByKey = useMemo(() => {
        const map = {};
        effectiveRows.forEach((row) => {
            map[row.permission_key] = row;
        });
        return map;
    }, [effectiveRows]);

    const effectiveMenuPreview = useMemo(() => {
        return menuMap.map((menu) => {
            const keys = menu.permission_keys || [];
            const rows = keys.map((key) => previewEffectiveByKey[key]).filter(Boolean);
            if (rows.length === 0) {
                return { ...menu, allowed: false, source: '-' };
            }

            const allowed = rows.every((row) => !!row.allowed);
            const sourceValues = [...new Set(rows.map((row) => row.source || '-'))];
            const source = sourceValues.length === 1 ? sourceValues[0] : 'mixed';
            return { ...menu, allowed, source };
        });
    }, [menuMap, previewEffectiveByKey]);

    const sectionedMenus = useMemo(() => {
        const sections = {};
        menuMap.forEach((menu) => {
            const key = menu.navbar_section || 'other';
            if (!sections[key]) sections[key] = [];
            sections[key].push(menu);
        });
        return sections;
    }, [menuMap]);

    const dirtyCount = useMemo(() => {
        return permissions.filter((permission) => {
            const current = activeEffects[permission.id] || 'inherited';
            const baseline = initialEffects[permission.id] || 'inherited';
            return current !== baseline;
        }).length;
    }, [permissions, activeEffects, initialEffects]);

    if (loading) {
        return <LoadingSpinner text="Memuat access policy..." />;
    }

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
                            <ShieldCheck className="text-sky-600" />
                            Akses & Policy
                        </h1>
                        <p className="text-slate-600 mt-1">
                            Mode menu-first: checkbox ON = allow, OFF = deny.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                            <CheckCircle2 size={14} />
                            Allow
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
                            <XCircle size={14} />
                            Deny
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                            <Layers3 size={14} />
                            Inherited
                        </span>
                    </div>
                </div>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <section className="xl:col-span-3 space-y-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm transition hover:shadow-md">
                        <h2 className="font-semibold text-slate-800 mb-3">1. Pilih Target</h2>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            {TARGET_TYPES.map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setTargetType(type)}
                                    className={`px-2 py-2 rounded-lg text-xs font-semibold transition ${
                                        targetType === type
                                            ? 'bg-sky-600 text-white shadow'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>

                        {targetType === 'role' && (
                            <select
                                value={selectedRole}
                                onChange={(event) => setSelectedRole(event.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                            >
                                {ROLES.map((role) => (
                                    <option key={role} value={role}>
                                        {role}
                                    </option>
                                ))}
                            </select>
                        )}

                        {targetType === 'group' && (
                            <select
                                value={selectedGroupId}
                                onChange={(event) => setSelectedGroupId(event.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                            >
                                <option value="">Pilih grup</option>
                                {groups.map((group) => (
                                    <option key={group.id} value={group.id}>
                                        {group.name} ({group.members_count || 0})
                                    </option>
                                ))}
                            </select>
                        )}

                        {targetType === 'user' && (
                            <select
                                value={selectedUserId}
                                onChange={(event) => setSelectedUserId(event.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                            >
                                <option value="">Pilih user</option>
                                {users.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.name} ({user.role})
                                    </option>
                                ))}
                            </select>
                        )}

                        <p className="mt-3 text-sm text-slate-600">
                            Target aktif: <span className="font-semibold text-slate-900">{selectedTargetLabel}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            Perubahan belum disimpan: {dirtyCount}
                        </p>
                    </div>

                    {targetType === 'group' && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm transition hover:shadow-md">
                            <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                <Users2 size={16} />
                                Anggota Grup
                            </h2>
                            <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                                {users.map((user) => (
                                    <label
                                        key={`member-${user.id}`}
                                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                                    >
                                        <span className="text-sm text-slate-700 truncate">
                                            {user.name} ({user.role})
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={groupMembers.includes(user.id)}
                                            onChange={() => toggleMember(user.id)}
                                            className="h-4 w-4 accent-sky-600"
                                        />
                                    </label>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-3">
                                <Button variant="danger" size="sm" onClick={deleteGroup} disabled={!selectedGroupId || saving}>
                                    Hapus Grup
                                </Button>
                            </div>
                        </div>
                    )}

                    <form onSubmit={createGroup} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm transition hover:shadow-md space-y-2">
                        <h2 className="font-semibold text-slate-800">Buat Grup Baru</h2>
                        <input
                            value={newGroup.name}
                            onChange={(event) => setNewGroup((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder="Nama grup"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                        <input
                            value={newGroup.slug}
                            onChange={(event) => setNewGroup((prev) => ({ ...prev, slug: event.target.value }))}
                            placeholder="Slug (opsional)"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                        <input
                            value={newGroup.description}
                            onChange={(event) => setNewGroup((prev) => ({ ...prev, description: event.target.value }))}
                            placeholder="Deskripsi (opsional)"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                        <Button type="submit" size="sm" disabled={saving}>
                            Tambah Grup
                        </Button>
                    </form>
                </section>

                <section className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold text-slate-800">2. Menu Toggle</h2>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={applyBulkOperationalOn}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition"
                            >
                                Aktifkan Operasional
                            </button>
                            <button
                                type="button"
                                onClick={applyBulkAllOff}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700 hover:bg-rose-200 transition"
                            >
                                Matikan Semua
                            </button>
                            <button
                                type="button"
                                onClick={applyResetBaseline}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition flex items-center gap-1"
                            >
                                <RefreshCcw size={13} />
                                Reset Baseline
                            </button>
                        </div>
                    </div>

                    {targetLoading && (
                        <p className="mt-3 text-xs text-slate-500">Memuat effective permission target...</p>
                    )}

                    <div className="mt-4 space-y-4 max-h-[650px] overflow-y-auto pr-1">
                        {Object.entries(sectionedMenus).map(([section, menus]) => (
                            <div key={section} className="rounded-xl border border-slate-200 p-3 bg-slate-50/60">
                                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                    {section.replace('_', ' ')}
                                </h3>
                                <div className="space-y-2">
                                    {menus.map((menu) => {
                                        const menuState = getMenuState(menu);
                                        const checked = menuState.status === 'allow';
                                        const statusClass =
                                            menuState.status === 'allow'
                                                ? 'text-emerald-700 bg-emerald-100'
                                                : menuState.status === 'deny'
                                                    ? 'text-rose-700 bg-rose-100'
                                                    : 'text-slate-600 bg-slate-100';

                                        return (
                                            <label
                                                key={menu.menu_key}
                                                className="group flex items-start gap-3 rounded-lg bg-white border border-slate-200 p-3 hover:-translate-y-0.5 hover:shadow-sm transition"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-4 w-4 accent-sky-600"
                                                    checked={checked}
                                                    onChange={(event) => setMenuToggle(menu, event.target.checked)}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-medium text-slate-800">{menu.label}</p>
                                                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusClass}`}>
                                                            {menuState.status}
                                                        </span>
                                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                                                            source: {menuState.source}
                                                        </span>
                                                        {menuState.pending && (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                                pending
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-1 break-words">
                                                        {(menu.permission_keys || []).join(', ')}
                                                    </p>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 flex justify-end">
                        <Button onClick={saveActiveTargetRules} disabled={saving} className="inline-flex items-center gap-2">
                            <Sparkles size={16} />
                            Simpan Perubahan Target
                        </Button>
                    </div>
                </section>

                <section className="xl:col-span-4 space-y-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                        <h2 className="font-semibold text-slate-800">3. Preview Menu Aktif (Effective User)</h2>
                        <select
                            value={selectedUserId}
                            onChange={(event) => setSelectedUserId(event.target.value)}
                            className="w-full mt-3 px-3 py-2 border border-slate-300 rounded-lg"
                        >
                            <option value="">Pilih user</option>
                            {users.map((user) => (
                                <option key={`preview-${user.id}`} value={user.id}>
                                    {user.name} ({user.role})
                                </option>
                            ))}
                        </select>
                        <div className="mt-3 max-h-80 overflow-y-auto space-y-2 pr-1">
                            {effectiveMenuPreview.map((menu) => (
                                <div key={`preview-menu-${menu.menu_key}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div>
                                        <p className="text-sm font-medium text-slate-800">{menu.label}</p>
                                        <p className="text-xs text-slate-500">source: {menu.source || '-'}</p>
                                    </div>
                                    <span
                                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                                            menu.allowed
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-rose-100 text-rose-700'
                                        }`}
                                    >
                                        {menu.allowed ? 'aktif' : 'mati'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                        <h2 className="font-semibold text-slate-800">Audit Trail</h2>
                        <div className="mt-3 max-h-80 overflow-y-auto pr-1 space-y-2">
                            {auditLogs.map((log) => (
                                <div key={`log-${log.id}`} className="rounded-lg border border-slate-200 px-3 py-2 bg-white">
                                    <p className="text-xs text-slate-500">
                                        {new Date(log.created_at).toLocaleString('id-ID')}
                                    </p>
                                    <p className="text-sm font-medium text-slate-800">
                                        {log.actor?.name || '-'} | {log.action}
                                    </p>
                                    <p className="text-xs text-slate-600">
                                        {log.permission_key || '-'}
                                    </p>
                                </div>
                            ))}
                            {auditLogs.length === 0 && (
                                <p className="text-sm text-slate-500">Belum ada log policy.</p>
                            )}
                        </div>
                    </div>

                    <details className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                        <summary className="cursor-pointer font-semibold text-slate-800">
                            Mode Advanced (Permission Key)
                        </summary>
                        <div className="mt-3 max-h-72 overflow-y-auto">
                            <table className="min-w-full text-xs">
                                <thead className="text-slate-500">
                                    <tr>
                                        <th className="text-left py-1">Permission</th>
                                        <th className="text-left py-1">Effect</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {permissions.map((permission) => {
                                        const effect = activeEffects[permission.id] || 'inherited';
                                        return (
                                            <tr key={`adv-${permission.id}`}>
                                                <td className="py-1 pr-3">{permission.key}</td>
                                                <td className="py-1">
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full ${
                                                            effect === 'allow'
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : effect === 'deny'
                                                                    ? 'bg-rose-100 text-rose-700'
                                                                    : 'bg-slate-100 text-slate-600'
                                                        }`}
                                                    >
                                                        {effect}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>
            </div>
        </div>
    );
}

export default AccessPolicyPage;
