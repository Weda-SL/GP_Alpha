import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FileText,
  Package,
  ClipboardList,
  LogOut,
  CircleUser as UserCircle,
  Building2,
  Lock,
  Users,
  Recycle,
  Star,
  ScrollText,
  DollarSign,
  Trash2,
  Award,
  Settings,
  FlaskConical,
  Layers,
  Store,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Logo } from './Logo';
import { logAuditEvent } from '../utils/auditLogger';
import { NavDropdown } from './NavDropdown';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [userStatus, setUserStatus] = React.useState<string | null>(null);
  const [businessCode, setBusinessCode] = React.useState<string | null>(null);
  const [businessCategory, setBusinessCategory] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.id) return;

      try {
        const { data: userData, error } = await supabase
          .from('users')
          .select('role, status')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching user role:', error);
          return;
        }

        if (!userData) {
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{ id: user.id, role: 'customer' }])
            .select('role, status')
            .single();

          if (insertError) {
            console.error('Error creating user record:', insertError);
            return;
          }

          setUserRole(newUser.role);
          setUserStatus(newUser.status);
        } else {
          setUserRole(userData.role);
          setUserStatus(userData.status);
        }

        if (userData?.role === 'customer') {
          const { data: profileData } = await supabase
            .from('customer_profiles')
            .select('business_code, business_categories(name)')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profileData) {
            setBusinessCode(profileData.business_code);
            setBusinessCategory(profileData.business_categories?.name || null);
          }
        }
      } catch (err) {
        console.error('Error in user role management:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [user?.id]);

  const handleLogout = async () => {
    if (user) {
      await logAuditEvent('LOGOUT', 'users', user.id);
    }
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const navLinkClass = (path: string) =>
    `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-16 transition-colors ${
      location.pathname === path
        ? 'border-blue-500 text-gray-900'
        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
    }`;

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left: logo + primary nav */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center px-2 py-2 text-gray-900 mr-4">
                <Logo className="h-12 w-12 text-blue-600" />
                <span className="ml-2 text-sm font-semibold">Hub</span>
              </Link>

              <div className="hidden sm:flex sm:items-center sm:space-x-1">
                {/* Users — direct link, admin only */}
                {userRole === 'admin' && (
                  <Link to="/users" className={navLinkClass('/users')}>
                    <Users className="h-4 w-4 mr-1.5" />
                    Users
                  </Link>
                )}

                {/* Configuration dropdown — admin only */}
                {userRole === 'admin' && (
                  <NavDropdown
                    label="Configuration"
                    icon={<Settings className="h-4 w-4" />}
                    items={[
                      {
                        label: 'Business Categories',
                        path: '/categories',
                        icon: <Building2 className="h-4 w-4" />,
                      },
                      {
                        label: 'Plastic Types',
                        path: '/plastic-types',
                        icon: <Recycle className="h-4 w-4" />,
                      },
                      {
                        label: 'Plastic Grades',
                        path: '/plastic-grades',
                        icon: <Star className="h-4 w-4" />,
                      },
                      {
                        label: 'Recycler Grades',
                        path: '/recycler-grades',
                        icon: <Award className="h-4 w-4" />,
                      },
                      {
                        label: 'Tests',
                        path: '/tests',
                        icon: <FileText className="h-4 w-4" />,
                        dividerBefore: true,
                      },
                      {
                        label: 'Test Suites',
                        path: '/test-suites',
                        icon: <Package className="h-4 w-4" />,
                      },
                      {
                        label: 'Audit Logs',
                        path: '/audit-logs',
                        icon: <ScrollText className="h-4 w-4" />,
                        dividerBefore: true,
                      },
                    ]}
                  />
                )}

                {/* Operations dropdown — admin only */}
                {userRole === 'admin' && (
                  <NavDropdown
                    label="Operations"
                    icon={<Layers className="h-4 w-4" />}
                    items={[
                      {
                        label: 'Lab Orders',
                        path: '/orders',
                        icon: <ClipboardList className="h-4 w-4" />,
                      },
                      {
                        label: 'Waste Management',
                        path: '/waste-management',
                        icon: <Trash2 className="h-4 w-4" />,
                      },
                      {
                        label: 'Marketplace',
                        path: '/marketplace',
                        icon: <Store className="h-4 w-4" />,
                      },
                    ]}
                  />
                )}

                {/* Finance — direct link, admin + finance role */}
                {(userRole === 'admin' || userRole === 'finance') && (
                  <Link to="/finance-approval" className={navLinkClass('/finance-approval')}>
                    <DollarSign className="h-4 w-4 mr-1.5" />
                    Finance
                  </Link>
                )}

                {/* Recycler — direct link, non-admin recycler customers */}
                {userRole !== 'admin' && businessCategory === 'Recycler' && userStatus === 'approved' && (
                  <Link
                    to="/waste-management"
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-16 transition-colors ${
                      location.pathname.startsWith('/waste-management')
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Recycler
                  </Link>
                )}

                {/* Marketplace — direct link, approved Recycler or Packaging Manufacturer */}
                {userRole !== 'admin' &&
                  userStatus === 'approved' &&
                  (businessCategory === 'Recycler' || businessCategory === 'Packaging Manufacturer') && (
                    <Link to="/marketplace" className={navLinkClass('/marketplace')}>
                      <Store className="h-4 w-4 mr-1.5" />
                      Marketplace
                    </Link>
                  )}

                {/* Lab — direct link, manager + approved customers (non-admin) */}
                {userRole !== 'admin' && (userRole === 'manager' || userStatus === 'approved') && (
                  <Link to="/orders" className={navLinkClass('/orders')}>
                    <FlaskConical className="h-4 w-4 mr-1.5" />
                    Lab
                  </Link>
                )}
              </div>
            </div>

            {/* Right: profile, password, business code, logout */}
            <div className="flex items-center space-x-3">
              <Link to="/profile" className={navLinkClass('/profile')}>
                <UserCircle className="h-4 w-4 mr-1.5" />
                Profile
              </Link>
              <Link to="/change-password" className={navLinkClass('/change-password')}>
                <Lock className="h-4 w-4 mr-1.5" />
                Password
              </Link>
              {businessCode && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  {businessCode}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 transition-colors"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
