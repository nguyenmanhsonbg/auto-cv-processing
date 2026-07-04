import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthProvider, useAuthContext } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings,
  Briefcase,
  Tag,
  BarChart2,
  UserCog,
  Bot,
  Cpu,
} from 'lucide-react';
import type { User } from '@interview-assistant/shared';
import { UserRole } from '@interview-assistant/shared';

// Nav items visible to all authenticated users
const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Candidates', href: '/candidates', icon: Users },
  { label: 'Sessions', href: '/sessions', icon: ClipboardList },
];

// Nav items visible to admin only (rendered separately below)
const adminNavItems = [
  { label: 'Questions', href: '/questions', icon: FileText },
];

const recruitmentNavItems = [
  { label: 'Job Descriptions', href: '/recruitment/job-descriptions', icon: FileText },
  { label: 'Job Postings', href: '/recruitment/job-postings', icon: Briefcase },
  { label: 'Applications', href: '/recruitment/applications', icon: Users },
];

function SidebarContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuthContext();
  const [collapsed, setCollapsed] = useState<boolean>(
    () => {
      // On mobile, start collapsed by default
      if (window.innerWidth <= 768) return true;
      return localStorage.getItem('sidebar-collapsed') === 'true';
    },
  );
  const [settingsExpanded, setSettingsExpanded] = useState<boolean>(
    () => localStorage.getItem('settings-expanded') === 'true',
  );
  const [recruitmentExpanded, setRecruitmentExpanded] = useState<boolean>(
    () => localStorage.getItem('recruitment-expanded') === 'true',
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    if (!token && !refreshToken) {
      navigate('/login');
      return;
    }
    apiClient.setToken(token);
    apiClient.setRefreshToken(refreshToken);
    apiClient.get<User>('/auth/me').then((u) => setUser(u)).catch((err) => {
      // Only logout on 401 — network errors (e.g. backend restarting) should not clear the session
      if (err instanceof ApiError && err.status === 401) {
        apiClient.clearTokens();
        navigate('/login');
      }
    });
  }, [navigate, setUser]);

  const handleLogout = () => {
    const refreshToken = apiClient.getRefreshToken();
    if (refreshToken) {
      void apiClient.post('/auth/logout', { refreshToken }).catch(() => undefined);
    }
    apiClient.clearTokens();
    navigate('/login');
  };

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  const isAdmin = user?.role === UserRole.ADMIN;
  const isRecruitmentUser = user?.role === UserRole.ADMIN || user?.role === UserRole.HR;

  return (
    <aside
      className={cn(
        'border-r bg-muted/40 flex flex-col shrink-0 transition-all duration-200 h-full',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Branding */}
      <div className={cn('p-4 overflow-hidden', collapsed ? 'px-3' : 'p-6')}>
        {collapsed ? (
          <div className="flex justify-center">
            <span className="text-lg font-bold">V</span>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold">VCS Interview</h1>
            <p className="text-sm text-muted-foreground">Assistant</p>
          </>
        )}
      </div>
      <Separator />

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}

        {/* Admin-only nav items (Questions, etc.) */}
        {isAdmin && adminNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}

        {isRecruitmentUser && (
          <>
            <Separator className="my-1" />
            <button
              title={collapsed ? 'Recruitment' : undefined}
              onClick={() => {
                const next = !recruitmentExpanded;
                setRecruitmentExpanded(next);
                localStorage.setItem('recruitment-expanded', String(next));
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                collapsed && 'justify-center px-2',
                location.pathname.startsWith('/recruitment')
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Briefcase className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Recruitment</span>
                  {recruitmentExpanded
                    ? <ChevronDown className="h-3.5 w-3.5" />
                    : <ChevronRight className="h-3.5 w-3.5" />}
                </>
              )}
            </button>

            {!collapsed && recruitmentExpanded && (
              <div className="ml-4 space-y-1">
                {recruitmentNavItems.map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    to={href}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                      location.pathname.startsWith(href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Settings sub-menu — admin only */}
        {isAdmin && (
          <>
            <Separator className="my-1" />
            {/* Settings header row */}
            <button
              title={collapsed ? 'Settings' : undefined}
              onClick={() => {
                const next = !settingsExpanded;
                setSettingsExpanded(next);
                localStorage.setItem('settings-expanded', String(next));
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                collapsed && 'justify-center px-2',
                location.pathname.startsWith('/settings')
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Settings</span>
                  {settingsExpanded
                    ? <ChevronDown className="h-3.5 w-3.5" />
                    : <ChevronRight className="h-3.5 w-3.5" />}
                </>
              )}
            </button>

            {/* Sub-items — only visible when sidebar expanded + settings expanded */}
            {!collapsed && settingsExpanded && (
              <div className="ml-4 space-y-1">
                {[
                  { label: 'AMIS Careers', href: '/settings/positions', icon: Briefcase },
                  { label: 'Categories', href: '/settings/categories', icon: Tag },
                  { label: 'Levels', href: '/settings/levels', icon: BarChart2 },
                  { label: 'Users', href: '/settings/users', icon: UserCog },
                  { label: 'AI Prompts', href: '/settings/prompts', icon: Bot },
                  { label: 'AI Models', href: '/settings/models', icon: Cpu },
                ].map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    to={href}
                          className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                      location.pathname.startsWith(href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      <Separator />

      {/* User + collapse */}
      <div className={cn('p-2 space-y-1', collapsed ? 'px-2' : 'p-4')}>
        {!collapsed && user && (
          <div className="mb-2 px-1">
            <p className="text-sm font-medium truncate">{user.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user.role}</p>
          </div>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="sm"
            title="Logout"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="ml-2">Logout</span>
          </Button>
        )}
        {/* Collapse toggle — always visible */}
        <Button
          variant="ghost"
          size="sm"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn('w-full flex', collapsed ? 'justify-center px-2' : 'justify-start')}
          onClick={toggleCollapse}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span className="ml-2">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

function LayoutInner() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — always visible and expanded on all screen sizes */}
      <div className="flex shrink-0">
        <SidebarContent />
      </div>

      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function InterviewerLayout() {
  return (
    <AuthProvider>
      <LayoutInner />
    </AuthProvider>
  );
}
