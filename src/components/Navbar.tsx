import React from 'react';
import { 
  Home, 
  Map, 
  Trophy, 
  Briefcase, 
  User, 
  Sparkles,
  Flame,
  Bell,
  Zap,
  ShieldAlert,
  MessageSquare
} from 'lucide-react';
import { ViewState, Quest, UserProfile } from '../types';
import { translations } from '../data/translations';
import { playSoftClick } from '../utils/audio';
import QuestLogo from './QuestLogo';
import { NotificationDoc } from './NotificationScreen';

interface NavbarProps {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
  unclaimedChallengesCount: number;
  unreadTasksCount: number;
  tokenBalance: number;
  lang: 'ar' | 'fr' | 'en';
  isAdmin?: boolean;
  audioEnabled?: boolean;
  unreadNotificationsCount: number;
  unreadChatsCount: number;
  onBellClick: () => void;
  onInboxClick: () => void;
  userProfile?: UserProfile | null;
  quests?: Quest[];
  notifications?: NotificationDoc[];
}

export default function Navbar({ 
  currentView, 
  onViewChange, 
  unclaimedChallengesCount, 
  unreadTasksCount,
  tokenBalance,
  lang,
  isAdmin = false,
  audioEnabled = true,
  unreadNotificationsCount,
  unreadChatsCount,
  onBellClick,
  onInboxClick,
  userProfile = null,
  quests = [],
  notifications = []
}: NavbarProps) {
  
  const dict = translations[lang];

  const NAV_ITEMS: { 
    id: ViewState; 
    label: string; 
    icon: React.ComponentType<{ className?: string }>;
    hasBadge?: boolean;
    badgeValue?: string | number;
  }[] = [
    { 
      id: 'home', 
      label: dict.home, 
      icon: Home,
      hasBadge: (quests || []).some(q => q.status === 'open' && (Number(q.cashReward) >= 3000 || Number(q.pointsReward) >= 100) && (!userProfile?.city || q.location.toLowerCase().includes(userProfile.city.toLowerCase())))
    },
    { 
      id: 'map', 
      label: dict.map, 
      icon: Map,
      hasBadge: (quests || []).some(q => q.status === 'open' && (Number(q.cashReward) >= 3000 || Number(q.pointsReward) >= 100) && (!userProfile?.city || q.location.toLowerCase().includes(userProfile.city.toLowerCase())))
    },
    { 
      id: 'my-quests', 
      label: dict.myQuests, 
      icon: Briefcase, 
      hasBadge: unreadTasksCount > 0 || (notifications || []).some(n => !n.read && (n.type === 'applicant' || n.type === 'arrival' || n.type === 'approved' || n.type === 'completed' || n.text.includes('عقد') || n.text.includes('كويست') || n.text.includes('Quest') || n.text.includes('Contract') || n.text.includes('مهمة') || n.text.includes('موافق'))),
      badgeValue: unreadTasksCount > 0 ? unreadTasksCount : undefined
    },
    { 
      id: 'leaderboard', 
      label: dict.leaderboard, 
      icon: Trophy, 
      hasBadge: unclaimedChallengesCount > 0,
      badgeValue: unclaimedChallengesCount > 0 ? unclaimedChallengesCount : undefined
    },
    { 
      id: 'profile', 
      label: dict.profile, 
      icon: User,
      hasBadge: (notifications || []).some(n => !n.read && (n.type === 'approved' || n.text.includes('شحن') || n.text.includes('الرصيد') || n.text.includes('refill') || n.text.includes('credited')))
    },
  ];

  if (isAdmin) {
    NAV_ITEMS.push({
      id: 'admin',
      label: lang === 'ar' ? 'الإشراف' : lang === 'fr' ? 'Superviser' : 'Supervise',
      icon: ShieldAlert
    });
  }

  const isRtl = lang === 'ar';

  return (
    <>
      {/* Top Main Brand Header Bar - Styled in refined borderless pure white background */}
      <header 
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
        className="fixed top-0 left-0 right-0 h-16 bg-[#FFFFFF] z-40 flex items-center justify-between px-4 md:px-8 select-none"
      >
        
        {/* Brand Name Logo on the left */}
        <div className="flex items-center gap-2 cursor-pointer transition-transform duration-150 active:scale-95" onClick={() => { playSoftClick(audioEnabled); onViewChange('home'); }}>
          <QuestLogo size="sm" textColor="text-[#FF3B7C]" />
          <span className="text-white text-[8.5px] py-0.5 px-1.5 rounded-lg bg-[#FF3B7C] font-black tracking-widest uppercase">DZ</span>
        </div>
 
        {/* Dynamic active Token Balance on center-right, Chat Inbox & Notification bell on right */}
        <div className="flex items-center gap-2">
          
          {/* Active Token Balance in minimal organic float shape */}
          <div 
            onClick={() => onViewChange('profile')}
            className="flex items-center gap-1.5 bg-transparent px-2.5 py-1.5 rounded-xl cursor-pointer transition-all duration-200"
          >
            <Zap className="w-4.5 h-4.5 text-[#FFD34D] fill-[#FFD34D]/25" />
            <span className="text-sm font-black font-mono text-[#1F2A44] flex items-center gap-0.5">
              {tokenBalance}
            </span>
          </div>
 
          {/* Elegant float Chat Inbox button */}
          <button 
            onClick={onInboxClick}
            className="w-9 h-9 rounded-xl bg-transparent flex items-center justify-center relative text-[#1F2A44] hover:bg-black/5 cursor-pointer transition-all active:scale-95"
            title={lang === 'ar' ? 'الرسائل' : 'Inbox'}
          >
            <MessageSquare className="w-5 h-5 text-[#1F2A44]" />
            {unreadChatsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#FF3B7C] rounded-full ring-2 ring-white"></span>
            )}
          </button>

          {/* Elegant float notification bell */}
          <button 
            onClick={onBellClick}
            className="w-9 h-9 rounded-xl bg-transparent flex items-center justify-center relative text-[#1F2A44] hover:bg-black/5 cursor-pointer transition-all active:scale-95"
            title={lang === 'ar' ? 'الإشعارات' : 'Notifications'}
          >
            <Bell className="w-5 h-5 text-[#1F2A44]" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#FF3B7C] rounded-full ring-2 ring-white"></span>
            )}
          </button>
        </div>

      </header>

      {/* Bottom bar in glassmorphic transparent white backdrop-filter */}
      <nav 
        style={{ 
          direction: isRtl ? 'rtl' : 'ltr',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(255, 255, 255, 0.25)'
        }}
        className="fixed bottom-0 left-0 right-0 z-40 px-2 lg:px-24"
      >
        <div className="max-w-xl mx-auto flex justify-between h-18 items-center py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => {
                  playSoftClick(audioEnabled);
                  onViewChange(item.id);
                }}
                className="flex-1 flex flex-col items-center justify-center relative py-1 focus:outline-none transition-all group scale-100 active:scale-95 cursor-pointer"
              >
                {/* Active Sky Blue marker at the top of active tab */}
                {isActive && (
                  <span className="absolute -top-1 w-8 h-1 bg-[#4FC3F7] rounded-full shadow-[0_2px_8px_rgba(79,195,247,0.4)]"></span>
                )}

                {/* Micro-Stack wrapper that scales perfectly avoiding key collision */}
                <div className={`relative transition-all duration-300 ${isActive ? 'scale-115' : 'scale-100'}`}>
                  {/* Tab Icon - Highlighted in Sky Blue */}
                  <Icon className={`w-5.5 h-5.5 transition-all ${
                    isActive 
                      ? 'text-[#4FC3F7] drop-shadow-[0_2px_6px_rgba(79,195,247,0.3)]' 
                      : 'text-gray-450 group-hover:text-gray-650'
                  }`} />

                  {/* Red Notification Badge */}
                  {item.hasBadge ? (
                    <span 
                      id={`nav-badge-${item.id}`}
                      className={`absolute bg-[#FF3B7C] text-white font-black rounded-full flex items-center justify-center border border-white animate-pulse transition-all shadow-md ${
                        item.badgeValue 
                          ? 'text-[7px] w-4 h-4 -top-1.5 -right-1.5' 
                          : 'w-2 h-2 -top-0.5 -right-0.5'
                      }`}
                    >
                      {item.badgeValue || ''}
                    </span>
                  ) : null}
                </div>

                {/* Tab label - Highlighted in Sky Blue */}
                <span className={`text-[10px] font-extrabold mt-1 tracking-tight transition-all font-sans ${
                  isActive 
                    ? 'text-[#4FC3F7] font-black' 
                    : 'text-gray-450 font-medium group-hover:text-gray-650'
                }`}>
                  {item.label}
                </span>

              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
export type { ViewState };
