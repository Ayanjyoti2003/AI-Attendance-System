import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import { getUsers, createUser, updateUserStatus, updateUserRole, resetUserPassword } from "../api/users";
import { getCurrentUser } from "../api/auth";
import type { User, CurrentUser } from "../types/user";
import LoadingSpinner from "../components/LoadingSpinner";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

export default function UsersPage() {
    const navigate = useNavigate();
    const { showToast } = useToast();

    // Data lists
    const [usersList, setUsersList] = useState<User[]>([]);
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Modal & Form states
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState<User["role"]>("ADMIN");
    const [submitting, setSubmitting] = useState(false);

    // Reset password modal states
    const [resetUser, setResetUser] = useState<User | null>(null);
    const [resetPasswordVal, setResetPasswordVal] = useState("");
    const [resetConfirmPasswordVal, setResetConfirmPasswordVal] = useState("");
    const [forceChangePassword, setForceChangePassword] = useState(true);
    const [resetting, setResetting] = useState(false);

    const handleOpenResetModal = (user: User) => {
        setResetUser(user);
        setResetPasswordVal("");
        setResetConfirmPasswordVal("");
        setForceChangePassword(true);
    };

    const handleResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetUser) return;

        if (resetPasswordVal.length < 8) {
            showToast("Password must be at least 8 characters.", "warning");
            return;
        }

        if (resetPasswordVal !== resetConfirmPasswordVal) {
            showToast("Passwords do not match.", "warning");
            return;
        }

        setResetting(true);
        try {
            const res = await resetUserPassword(resetUser.id, {
                new_password: resetPasswordVal,
                must_change_password: forceChangePassword
            });
            if (res.error) {
                showToast(res.error, "error");
            } else {
                showToast(`Password for '${resetUser.username}' reset successfully!`, "success");
                setResetUser(null);
            }
        } catch (err: any) {
            console.error("Error resetting password:", err);
            const msg = err.response?.data?.detail || "Failed to reset password.";
            showToast(msg, "error");
        } finally {
            setResetting(false);
        }
    };

    // Load active profile and users list
    async function loadData() {
        setLoading(true);
        try {
            const [profile, users] = await Promise.all([
                getCurrentUser(),
                getUsers()
            ]);
            setCurrentUser(profile);
            setUsersList(users);
        } catch (err) {
            console.error("Error loading users database:", err);
            showToast("Failed to retrieve user registry. You might lack permissions.", "error");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

    // Handle create user
    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isSuperAdmin) {
            showToast("Access Denied: Only SUPER_ADMIN can create users.", "error");
            return;
        }
        if (!newUsername.trim() || !newPassword.trim()) {
            showToast("Please fill in all fields.", "warning");
            return;
        }

        setSubmitting(true);
        try {
            const res = await createUser({
                username: newUsername,
                password: newPassword,
                role: newRole
            });
            if (res.error) {
                showToast(res.error, "error");
            } else {
                showToast(`User '${newUsername}' registered successfully!`, "success");
                setIsCreateModalOpen(false);
                setNewUsername("");
                setNewPassword("");
                setNewRole("ADMIN");
                
                // Reload
                const updatedUsers = await getUsers();
                setUsersList(updatedUsers);
            }
        } catch (err) {
            console.error("Error creating user:", err);
            showToast("Failed to register user. Try a different username.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    // Handle status change
    const handleStatusChange = async (userId: number, username: string, newStatus: User["status"]) => {
        if (!isSuperAdmin) {
            showToast("Access Denied: Only SUPER_ADMIN can edit status.", "error");
            return;
        }
        if (currentUser?.sub === username) {
            showToast("Action Forbidden: You cannot change your own status.", "error");
            return;
        }

        try {
            await updateUserStatus(userId, newStatus);
            setUsersList((prev) =>
                prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
            );
            showToast(`User '${username}' status updated to ${newStatus}.`, "success");
        } catch (err) {
            console.error("Error updating user status:", err);
            showToast("Failed to modify user status.", "error");
        }
    };

    // Handle role change
    const handleRoleChange = async (userId: number, username: string, newRoleValue: User["role"]) => {
        if (!isSuperAdmin) {
            showToast("Access Denied: Only SUPER_ADMIN can edit roles.", "error");
            return;
        }
        if (currentUser?.sub === username) {
            showToast("Action Forbidden: You cannot modify your own role.", "error");
            return;
        }

        try {
            const res = await updateUserRole(userId, newRoleValue);
            if (res.error) {
                showToast(res.error, "error");
            } else {
                setUsersList((prev) =>
                    prev.map((u) => (u.id === userId ? { ...u, role: newRoleValue } : u))
                );
                showToast(`User '${username}' role updated to ${newRoleValue}.`, "success");
            }
        } catch (err) {
            console.error("Error updating user role:", err);
            showToast("Failed to modify user role.", "error");
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-64 items-center justify-center">
                    <LoadingSpinner size="lg" />
                </div>
            </DashboardLayout>
        );
    }

    if (!isSuperAdmin) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg mx-auto mt-12 animate-fade-in shadow-xl transition-colors duration-250">
                    <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-500 rounded-full flex items-center justify-center border border-rose-105 dark:border-rose-900/30 mb-5">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Access Denied</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-sm mb-6">
                        Only users with <strong>SUPER_ADMIN</strong> privileges are authorized to access the system user management suite.
                    </p>
                    <button
                        onClick={() => navigate("/dashboard")}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 cursor-pointer"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 select-none animate-fade-in">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">System Users</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                            Manage dashboard operator accounts, update role permissions, and block access.
                        </p>
                    </div>

                    {isSuperAdmin && (
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-lg shadow-blue-600/10 cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Add User
                        </button>
                    )}
                </div>

                {/* Info disclaimer */}
                {!isSuperAdmin && (
                    <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-start gap-3 transition-colors duration-250">
                        <svg className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                            <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">View Only Access</h4>
                            <p className="text-xs text-zinc-550 dark:text-zinc-500 mt-0.5">
                                Your account is not configured with SUPER_ADMIN privileges. You can view users, but creating accounts or modifying roles is disabled.
                            </p>
                        </div>
                    </div>
                )}

                {/* Table Data */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl transition-colors duration-250">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-300 uppercase tracking-wider text-xs border-b border-zinc-200 dark:border-zinc-800 transition-colors duration-250">
                                    <th className="p-4 font-semibold">ID</th>
                                    <th className="p-4 font-semibold">Username</th>
                                    <th className="p-4 font-semibold">Role</th>
                                    <th className="p-4 font-semibold">Status</th>
                                    {isSuperAdmin && <th className="p-4 font-semibold text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                {usersList.map((usr) => {
                                    const isSelf = usr.username === currentUser?.sub;
                                    return (
                                        <tr
                                            key={usr.id}
                                            className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/30 text-zinc-800 dark:text-zinc-200 transition-colors"
                                        >
                                            <td className="p-4 font-medium text-zinc-400 dark:text-zinc-500">{usr.id}</td>
                                            <td className="p-4 font-semibold text-zinc-900 dark:text-white">
                                                {usr.username}
                                                {isSelf && (
                                                    <span className="ml-2 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/30 px-2 py-0.5 rounded-full font-bold">
                                                        You
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                {isSuperAdmin && !isSelf ? (
                                                    <select
                                                        value={usr.role}
                                                        onChange={(e) =>
                                                            handleRoleChange(
                                                                usr.id,
                                                                usr.username,
                                                                e.target.value as User["role"]
                                                            )
                                                        }
                                                        className="px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                                                    >
                                                        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                                                        <option value="ADMIN">ADMIN</option>
                                                        <option value="HR">HR</option>
                                                        <option value="VIEWER">VIEWER</option>
                                                    </select>
                                                ) : (
                                                    <span className="text-zinc-600 dark:text-zinc-400 text-xs font-semibold uppercase bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-750">
                                                        {usr.role}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <StatusBadge status={usr.status} />
                                                </div>
                                            </td>
                                            {isSuperAdmin && (
                                                <td className="p-4 text-right flex items-center justify-end gap-3 border-0">
                                                    {!isSelf ? (
                                                        <>
                                                            <select
                                                                value={usr.status}
                                                                onChange={(e) =>
                                                                    handleStatusChange(
                                                                        usr.id,
                                                                        usr.username,
                                                                        e.target.value as User["status"]
                                                                    )
                                                                }
                                                                className="px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                                                            >
                                                                <option value="ACTIVE">ACTIVE</option>
                                                                <option value="INACTIVE">INACTIVE</option>
                                                                <option value="SUSPENDED">SUSPENDED</option>
                                                            </select>
                                                            <button
                                                                onClick={() => handleOpenResetModal(usr)}
                                                                className="px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-450 hover:text-rose-550 dark:hover:text-rose-350 border border-rose-200 dark:border-rose-900/30 hover:border-rose-500 bg-rose-50/20 dark:bg-rose-950/20 rounded-md transition-colors cursor-pointer"
                                                                title="Reset password for this user"
                                                            >
                                                                Reset
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <span className="text-zinc-400 dark:text-zinc-500 text-xs font-semibold">Self-managed</span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Create User Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setNewUsername("");
                    setNewPassword("");
                    setNewRole("ADMIN");
                }}
                title="Create User Account"
            >
                <form onSubmit={handleCreateSubmit} className="flex flex-col gap-5">
                    {/* Username */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Username
                        </label>
                        <input
                            type="text"
                            placeholder="Enter username"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-650 transition-all"
                            required
                        />
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Password
                        </label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-650 transition-all"
                            required
                        />
                    </div>

                    {/* Role */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Role
                        </label>
                        <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value as User["role"])}
                            className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 text-sm focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
                        >
                            <option value="ADMIN">ADMIN</option>
                            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                            <option value="HR">HR</option>
                            <option value="VIEWER">VIEWER</option>
                        </select>
                    </div>

                    {/* Submit actions */}
                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            type="button"
                            onClick={() => {
                                setIsCreateModalOpen(false);
                                setNewUsername("");
                                setNewPassword("");
                                setNewRole("ADMIN");
                            }}
                            className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 flex items-center gap-2 cursor-pointer"
                        >
                            {submitting ? (
                                <>
                                    <LoadingSpinner size="sm" />
                                    Creating...
                                </>
                            ) : (
                                "Create Account"
                            )}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Reset Password Modal */}
            <Modal
                isOpen={!!resetUser}
                onClose={() => setResetUser(null)}
                title={`Reset Password for '${resetUser?.username}'`}
            >
                <form onSubmit={handleResetSubmit} className="flex flex-col gap-5">
                    {/* New Password */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            New Temporary Password
                        </label>
                        <input
                            type="password"
                            placeholder="Minimum 8 characters"
                            value={resetPasswordVal}
                            onChange={(e) => setResetPasswordVal(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-650 transition-all"
                            required
                        />
                    </div>

                    {/* Confirm Password */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Confirm Password
                        </label>
                        <input
                            type="password"
                            placeholder="Re-enter password"
                            value={resetConfirmPasswordVal}
                            onChange={(e) => setResetConfirmPasswordVal(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 text-sm focus:border-blue-500 focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-650 transition-all"
                            required
                        />
                    </div>

                    {/* Force Change Password Checkbox */}
                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-205 dark:border-zinc-800 transition-colors">
                        <input
                            type="checkbox"
                            checked={forceChangePassword}
                            onChange={(e) => setForceChangePassword(e.target.checked)}
                            className="w-5 h-5 rounded border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-blue-600 focus:ring-blue-500/20 transition-colors cursor-pointer"
                        />
                        <span className="text-zinc-650 dark:text-zinc-350 group-hover:text-zinc-850 dark:group-hover:text-zinc-200 text-sm font-medium transition-colors select-none">
                            Force user to change password at next login
                        </span>
                    </label>

                    {/* Submit actions */}
                    <div className="flex justify-end gap-3 mt-2">
                        <button
                            type="button"
                            onClick={() => setResetUser(null)}
                            className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={resetting}
                            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/10 flex items-center gap-2 cursor-pointer"
                        >
                            {resetting ? (
                                <>
                                    <LoadingSpinner size="sm" />
                                    Resetting...
                                </>
                            ) : (
                                "Reset Password"
                            )}
                        </button>
                    </div>
                </form>
            </Modal>
        </DashboardLayout>
    );
}