import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
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

const defaultNavItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Candidates', href: '/candidates', icon: Users },
  { label: 'Freelancers', href: '/candidates/freelancers', icon: Users },
  { label: 'Internals', href: '/candidates/internals', icon: Users },
  { label: 'Sessions', href: '/sessions', icon: ClipboardList },
];

const hrAdminNavItems = [
  { label: 'Questions', href: '/questions', icon: FileText },
];

const recruitmentNavItems = [
  { label: 'Job Descriptions', href: '/recruitment/job-descriptions', icon: FileText },
  { label: 'Job Postings', href: '/recruitment/job-postings', icon: Briefcase },
  { label: 'Applications', href: '/recruitment/applications', icon: Users },
];

const settingsNavItems = [
  { label: 'AMIS Careers', href: '/settings/positions', icon: Briefcase },
  { label: 'Categories', href: '/settings/categories', icon: Tag },
  { label: 'Levels', href: '/settings/levels', icon: BarChart2 },
  { label: 'Users', href: '/settings/users', icon: UserCog },
  { label: 'AI Prompts', href: '/settings/prompts', icon: Bot },
  { label: 'AI Models', href: '/settings/models', icon: Cpu },
];

const freelancerWorkspacePath = '/candidates/freelancers';

type SidebarNavItem = {
  label: string;
  href: string;
  icon: typeof Briefcase;
};

function SidebarLink({
  item,
  pathname,
  collapsed,
  isActive,
}: {
  item: SidebarNavItem;
  pathname: string;
  collapsed: boolean;
  isActive?: boolean;
}) {
  const Icon = item.icon;
  const active = isActive ?? pathname.startsWith(item.href);

  return (
    <Link
      to={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        collapsed && 'justify-center px-2',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && item.label}
    </Link>
  );
}

function SidebarSubLink({
  item,
  pathname,
}: {
  item: SidebarNavItem;
  pathname: string;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.href}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
        pathname.startsWith(item.href)
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {item.label}
    </Link>
  );
}

function SidebarNavLinks({
  items,
  pathname,
  collapsed,
}: {
  items: SidebarNavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  const isCandidatePage = pathname.startsWith('/candidates');
  const isFreelancerPage = pathname.startsWith('/candidates/freelancers');
  const isInternalPage = pathname.startsWith('/candidates/internals');

  return (
    <>
      {items.map((item) => (
        <SidebarLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
          isActive={item.href === '/candidates'
            ? isCandidatePage && !isFreelancerPage && !isInternalPage
            : undefined}
        />
      ))}
    </>
  );
}

function SidebarSectionButton({
  label,
  icon: Icon,
  collapsed,
  expanded,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Briefcase;
  collapsed: boolean;
  expanded: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        collapsed && 'justify-center px-2',
        active
          ? 'text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{label}</span>
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </>
      )}
    </button>
  );
}

function RecruitmentNavSection({
  pathname,
  collapsed,
  expanded,
  onToggle,
}: {
  pathname: string;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <Separator className="my-1" />
      <SidebarSectionButton
        label="Recruitment"
        icon={Briefcase}
        collapsed={collapsed}
        expanded={expanded}
        active={pathname.startsWith('/recruitment')}
        onClick={onToggle}
      />
      {!collapsed && expanded && (
        <div className="ml-4 space-y-1">
          {recruitmentNavItems.map((item) => (
            <SidebarSubLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}
    </>
  );
}

function SettingsNavSection({
  pathname,
  collapsed,
  expanded,
  onToggle,
}: {
  pathname: string;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <Separator className="my-1" />
      <SidebarSectionButton
        label="Settings"
        icon={Settings}
        collapsed={collapsed}
        expanded={expanded}
        active={pathname.startsWith('/settings')}
        onClick={onToggle}
      />
      {!collapsed && expanded && (
        <div className="ml-4 space-y-1">
          {settingsNavItems.map((item) => (
            <SidebarSubLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}
    </>
  );
}

function SidebarNavigation({
  pathname,
  collapsed,
  user,
  recruitmentExpanded,
  settingsExpanded,
  onToggleRecruitment,
  onToggleSettings,
}: {
  pathname: string;
  collapsed: boolean;
  user: User | null;
  recruitmentExpanded: boolean;
  settingsExpanded: boolean;
  onToggleRecruitment: () => void;
  onToggleSettings: () => void;
}) {
  const isAdmin = user?.role === UserRole.ADMIN;
  const isFreelancerUser = user?.role === UserRole.FREELANCER;
  const isRecruitmentUser = isAdmin || user?.role === UserRole.HR;
  const primaryNavItems: SidebarNavItem[] = isFreelancerUser
    ? [{ label: 'Freelancer', href: freelancerWorkspacePath, icon: Users }]
    : defaultNavItems;

  return (
    <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
      <SidebarNavLinks items={primaryNavItems} pathname={pathname} collapsed={collapsed} />
      {!isFreelancerUser && isRecruitmentUser && (
        <SidebarNavLinks items={hrAdminNavItems} pathname={pathname} collapsed={collapsed} />
      )}
      {!isFreelancerUser && isRecruitmentUser && (
        <RecruitmentNavSection
          pathname={pathname}
          collapsed={collapsed}
          expanded={recruitmentExpanded}
          onToggle={onToggleRecruitment}
        />
      )}
      {!isFreelancerUser && isAdmin && (
        <SettingsNavSection
          pathname={pathname}
          collapsed={collapsed}
          expanded={settingsExpanded}
          onToggle={onToggleSettings}
        />
      )}
    </nav>
  );
}

function SidebarContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthContext();
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

  const toggleRecruitment = () => {
    const next = !recruitmentExpanded;
    setRecruitmentExpanded(next);
    localStorage.setItem('recruitment-expanded', String(next));
  };

  const toggleSettings = () => {
    const next = !settingsExpanded;
    setSettingsExpanded(next);
    localStorage.setItem('settings-expanded', String(next));
  };

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

      <SidebarNavigation
        pathname={location.pathname}
        collapsed={collapsed}
        user={user}
        recruitmentExpanded={recruitmentExpanded}
        settingsExpanded={settingsExpanded}
        onToggleRecruitment={toggleRecruitment}
        onToggleSettings={toggleSettings}
      />

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
        {/* Collapse toggle - always visible */}
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
  const location = useLocation();
  const { user, setUser } = useAuthContext();
  const [authState, setAuthState] = useState<'loading' | 'ready' | 'unauthenticated' | 'error'>('loading');

  useEffect(() => {
    let isActive = true;
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!token && !refreshToken) {
      apiClient.clearTokens();
      setUser(null);
      setAuthState('unauthenticated');
      return () => {
        isActive = false;
      };
    }

    apiClient.setToken(token);
    apiClient.setRefreshToken(refreshToken);
    apiClient.get<User>('/auth/me')
      .then((resolvedUser) => {
        if (!isActive) return;
        setUser(resolvedUser);
        setAuthState('ready');
      })
      .catch((err) => {
        if (!isActive) return;

        // Only logout on 401 - network errors (e.g. backend restarting) should not clear the session
        if (err instanceof ApiError && err.status === 401) {
          apiClient.clearTokens();
          setUser(null);
          setAuthState('unauthenticated');
          return;
        }

        setAuthState('error');
      });

    return () => {
      isActive = false;
    };
  }, [setUser]);

  if (authState === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Loading workspace...</h1>
          <p className="text-sm text-muted-foreground">Checking your account permissions.</p>
        </div>
      </div>
    );
  }

  if (authState === 'error') {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Workspace unavailable</h1>
          <p className="text-sm text-muted-foreground">
            Unable to load your workspace right now. Please try again in a moment.
          </p>
        </div>
      </div>
    );
  }

  if (authState === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === UserRole.FREELANCER && location.pathname !== freelancerWorkspacePath) {
    return <Navigate to={freelancerWorkspacePath} replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar - always visible and expanded on all screen sizes */}
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
