import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  dividerBefore?: boolean;
}

interface NavDropdownProps {
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

export function NavDropdown({ label, icon, items }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isActive = items.some(item =>
    item.path === location.pathname ||
    (item.path !== '/' && location.pathname.startsWith(item.path))
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-16 transition-colors ${
          isActive
            ? 'border-blue-500 text-gray-900'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
        }`}
      >
        <span className="mr-1.5">{icon}</span>
        {label}
        <ChevronDown
          className={`ml-1 h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-0 w-52 bg-white rounded-b-lg shadow-lg border border-gray-100 z-50 py-1">
          {items.map((item, idx) => {
            const itemActive =
              item.path === location.pathname ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <React.Fragment key={item.path}>
                {item.dividerBefore && idx > 0 && (
                  <div className="my-1 border-t border-gray-100" />
                )}
                <Link
                  to={item.path}
                  className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                    itemActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="flex-shrink-0 w-4 h-4">{item.icon}</span>
                  {item.label}
                </Link>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
