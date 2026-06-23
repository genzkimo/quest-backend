import React from 'react';
import { motion } from 'motion/react';
import { X, MessageSquare, Compass, Send } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../utils/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

interface InboxScreenProps {
  userChats: any[];
  quests?: any[];
  currentUserId: string;
  onClose: () => void;
  lang?: 'ar' | 'fr' | 'en';
  onOpenChat?: (chatId: string) => void;
}

export default function InboxScreen({ userChats, quests = [], currentUserId, onClose, lang = 'ar', onOpenChat }: InboxScreenProps) {
  const isRtl = lang === 'ar';

  const groupedChats = React.useMemo(() => {
    const groups: { [participantId: string]: any } = {};

    userChats.forEach((chat) => {
      const isCurrentUserOwner = currentUserId === chat.ownerId;
      const participantId = isCurrentUserOwner ? chat.applicantId : chat.ownerId;
      
      if (!participantId) {
        // Fallback if no participant ID, treat as distinct so it doesn't break
        groups[chat.id] = chat;
        return;
      }

      const existing = groups[participantId];
      if (!existing) {
        groups[participantId] = chat;
      } else {
        // Compare last message times
        const existingMessages = existing.messages || [];
        const existingLast = existingMessages[existingMessages.length - 1];
        const existingTime = existingLast?.createdAt ? new Date(existingLast.createdAt).getTime() : 0;

        const currentMessages = chat.messages || [];
        const currentLast = currentMessages[currentMessages.length - 1];
        const currentTime = currentLast?.createdAt ? new Date(currentLast.createdAt).getTime() : 0;

        if (currentTime > existingTime) {
          groups[participantId] = chat;
        }
      }
    });

    // Convert values back to array and sort descending by last message time
    return Object.values(groups).sort((a: any, b: any) => {
      const aMessages = a.messages || [];
      const aLast = aMessages[aMessages.length - 1];
      const aTime = aLast?.createdAt ? new Date(aLast.createdAt).getTime() : 0;

      const bMessages = b.messages || [];
      const bLast = bMessages[bMessages.length - 1];
      const bTime = bLast?.createdAt ? new Date(bLast.createdAt).getTime() : 0;

      return bTime - aTime;
    });
  }, [userChats, currentUserId]);

  const getInboxItemDetails = (chat: any) => {
    const isCurrentUserOwner = currentUserId === chat.ownerId;
    let recipientName = isCurrentUserOwner ? chat.applicantName : (chat.ownerName || 'صاحب العمل 💼');
    let recipientAvatar = isCurrentUserOwner ? chat.applicantAvatar : (chat.ownerAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150');

    // Dynamic self-repair fallback using local quest data cache
    if (!isCurrentUserOwner && (!chat.ownerName || !chat.ownerAvatar)) {
      const targetQuest = quests.find(q => q.id === chat.questId);
      if (targetQuest) {
        if (targetQuest.creatorName) recipientName = targetQuest.creatorName;
        if (targetQuest.creatorAvatar) recipientAvatar = targetQuest.creatorAvatar;
      }
    }

    return { recipientName, recipientAvatar };
  };

  const isChatUnread = (chat: any) => {
    const messages = chat.messages || [];
    if (messages.length === 0) return false;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.senderId === 'system' || lastMsg.senderId === currentUserId) return false;
    const readBy = chat.readBy || [];
    return !readBy.includes(currentUserId);
  };

  const handleOpenChatRoom = async (chat: any) => {
    const { recipientName, recipientAvatar } = getInboxItemDetails(chat);
    
    // Mark as read in Firestore
    if (auth.currentUser) {
      try {
        const chatDocRef = doc(db, 'chats', chat.id);
        await updateDoc(chatDocRef, {
          readBy: arrayUnion(currentUserId)
        });
      } catch (e) {
        console.error("Failed to mark chat as read in DB:", e);
        handleFirestoreError(e, OperationType.WRITE, `chats/${chat.id}`);
      }
    }

    if (onOpenChat) {
      onOpenChat(chat.id);
    } else {
      // Trigger global CustomEvent
      window.dispatchEvent(new CustomEvent('open-chat', {
        detail: {
          chatId: chat.id,
          questTitle: chat.questTitle,
          recipientName: recipientName,
          recipientAvatar: recipientAvatar
        }
      }));
    }

    onClose();
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString(isRtl ? 'ar-DZ' : 'fr-DZ', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1F2A44]/60 backdrop-blur-xs flex justify-end">
      {/* Off-canvas background closer */}
      <div className="absolute inset-0" onClick={onClose}></div>

      <motion.div
        initial={{ x: isRtl ? -400 : 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: isRtl ? -400 : 400, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col z-10 border-l border-slate-100 font-sans"
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      >
        {/* Header */}
        <div className="p-5 bg-[#1F2A44] text-white flex justify-between items-center border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-[#FFD34D]" />
            <h2 className="text-base font-black">
              {isRtl ? 'صندوق الرسائل 💬' : 'Message Inbox 💬'}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all cursor-pointer active:scale-95"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* List section */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-3.5">
          {groupedChats.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-550">
                {isRtl ? 'صندوقك فارغ تماماً 💨' : 'Inbox is empty 💨'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                {isRtl 
                  ? 'عندما تراسل الكباتن أو تقدم على مهمة، ستظهر كويستات المحادثات النشطة هنا.' 
                  : 'Active conversation threads for applied and posted quests appear here.'}
              </p>
            </div>
          ) : (
            groupedChats.map((chat) => {
              const { recipientName, recipientAvatar } = getInboxItemDetails(chat);
              const isUnread = isChatUnread(chat);
              const messages = chat.messages || [];
              const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

              const isCurrentUserOwner = currentUserId === chat.ownerId;
              const userRoleLabel = isCurrentUserOwner 
                ? (lang === 'ar' ? 'منفذ المهمة 🏃' : lang === 'fr' ? 'Captain 🏃' : 'Captain 🏃') 
                : (lang === 'ar' ? 'صاحب العمل 💼' : lang === 'fr' ? 'Client 💼' : 'Employer 💼');
              const userRoleColor = isCurrentUserOwner
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50'
                : 'bg-[#1F2A44]/10 text-[#1F2A44]/90 border-[#1F2A44]/20';

              return (
                <div
                  key={chat.id}
                  onClick={() => handleOpenChatRoom(chat)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative flex items-center gap-3.5 ${
                    isUnread
                      ? 'bg-blue-50/20 border-blue-150/50 shadow-xs ring-1 ring-blue-500/10'
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {/* Left indicator accent */}
                  {isUnread && (
                    <span className="absolute top-0 bottom-0 right-0 w-1.5 bg-blue-500 rounded-r-2xl"></span>
                  )}

                  {/* Avatar with unread dot indicator inside */}
                  <div className="w-11 h-11 rounded-full relative overflow-hidden bg-slate-100 shrink-0 border border-slate-150/60 font-sans">
                    <img src={recipientAvatar} alt={recipientName} className="w-full h-full object-cover" />
                  </div>

                  {/* Right text layout details */}
                  <div className="flex-1 min-w-0 pr-1 select-text">
                    <div className="flex justify-between items-baseline mb-0.5 gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <h3 className="text-xs font-black text-slate-800 truncate select-all">
                          {recipientName}
                        </h3>
                        <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded-md border shrink-0 leading-none ${userRoleColor}`}>
                          {userRoleLabel}
                        </span>
                      </div>
                      <span className="text-[9.5px] font-bold text-slate-400 whitespace-nowrap shrink-0">
                        ⏱️ {formatTime(lastMessage?.createdAt)}
                      </span>
                    </div>

                    <p className="text-[10px] font-extrabold text-slate-400 truncate mb-1 text-blue-600">
                      Quest: {chat.questTitle}
                    </p>

                    <p className={`text-xs truncate ${isUnread ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                      {lastMessage ? lastMessage.text : '...'}
                    </p>
                  </div>

                  {/* Unread circle badge */}
                  {isUnread && (
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
