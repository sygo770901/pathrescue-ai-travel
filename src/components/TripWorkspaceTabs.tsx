'use client';

import { cn } from '@/lib/utils';

export type WorkspaceTab = 'plan' | 'itinerary' | 'map' | 'ontrip';

const TABS: Array<{
  id: WorkspaceTab;
  label: string;
  short: string;
  requiresTrip: boolean;
}> = [
  { id: 'plan', label: '規劃', short: '規劃', requiresTrip: false },
  { id: 'itinerary', label: '行程', short: '行程', requiresTrip: true },
  { id: 'map', label: '地圖', short: '地圖', requiresTrip: true },
  { id: 'ontrip', label: '出行', short: '出行', requiresTrip: true },
];

interface TripWorkspaceTabsProps {
  active: WorkspaceTab;
  hasTrip: boolean;
  onChange: (tab: WorkspaceTab) => void;
  onBlocked?: () => void;
  /** desktop = under header; mobile = fixed bottom */
  placement: 'top' | 'bottom';
}

export function TripWorkspaceTabs({
  active,
  hasTrip,
  onChange,
  onBlocked,
  placement,
}: TripWorkspaceTabsProps) {
  const handleClick = (tab: WorkspaceTab, requiresTrip: boolean) => {
    if (requiresTrip && !hasTrip) {
      onBlocked?.();
      return;
    }
    onChange(tab);
  };

  const list = (
    <nav
      aria-label="行程工作區"
      className={cn(
        'flex items-stretch gap-1',
        placement === 'top' &&
          'rounded-xl border border-[var(--line)] bg-white/70 p-1',
        placement === 'bottom' && 'justify-around px-1',
      )}
    >
      {TABS.map((tab) => {
        const disabled = tab.requiresTrip && !hasTrip;
        const isActive = active === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            aria-disabled={disabled}
            onClick={() => handleClick(tab.id, tab.requiresTrip)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm',
              placement === 'top' && 'min-w-[4.5rem] flex-none sm:px-4',
              isActive &&
                tab.id === 'ontrip' &&
                'bg-[var(--coral)] text-white shadow-sm',
              isActive &&
                tab.id !== 'ontrip' &&
                'bg-[var(--ink)] text-white shadow-sm',
              !isActive &&
                !disabled &&
                'text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)]',
              disabled && 'cursor-not-allowed opacity-40',
            )}
          >
            <span>{placement === 'bottom' ? tab.short : tab.label}</span>
          </button>
        );
      })}
    </nav>
  );

  if (placement === 'bottom') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[rgba(247,244,238,0.94)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {list}
      </div>
    );
  }

  return <div className="hidden lg:block">{list}</div>;
}
