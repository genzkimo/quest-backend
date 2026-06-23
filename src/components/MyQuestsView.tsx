import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Trash2, 
  Edit3, 
  Briefcase, 
  X,
  AlertTriangle,
  Upload,
  Calendar,
  Layers,
  Sparkles,
  RefreshCw,
  FileText,
  Star,
  Image,
  Camera,
  MessageSquare,
  Send,
  Award,
  History,
  PhoneCall,
  Lock
} from 'lucide-react';
import { Quest, QuestCategory, UserProfile, Applicant } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { translations } from '../data/translations';
import { formatArabicDate } from '../utils/dateFormatter';
import { compressImage } from '../utils/imageCompressor';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage, db, auth, handleFirestoreError, OperationType } from '../utils/firebase';
import { doc, getDoc, setDoc, onSnapshot, collection } from 'firebase/firestore';

interface MyQuestsViewProps {
  quests: Quest[];
  currentUserId: string;
  lang: 'ar' | 'fr' | 'en';
  onPostNewQuest: (newQuest: Partial<Quest>) => void;
  onDeleteCreatedQuest: (questId: string) => void;
  onCancelBookedQuest: (questId: string, refundedTokens: number) => void;
  onUploadProof: (questId: string, proofUrl: string) => void;
  onConfirmPayout: (questId: string, rating?: number, comment?: string) => void;
  userProfile: UserProfile;
  onAcceptApplicant: (questId: string, applicantId: string) => void;
  onViewPublicProfile?: (userId: string) => void;
  deferredActiveChat?: any;
  onClearDeferredChat?: () => void;
  initialTab?: 'obligations' | 'created' | null;
  onClearInitialTab?: () => void;
  onViewQuestDetail?: (questId: string) => void;
  initialSelectedQuestId?: string | null;
  onClearInitialSelectedQuest?: () => void;
  onForceReleaseContract?: (questId: string) => void;
  onSendPushNotification?: (recipientId: string, title: string, body: string, data?: Record<string, string>) => void;
  autoOpenCreate?: boolean;
  onClearAutoOpenCreate?: () => void;
}

const CATEGORIES_LIST: QuestCategory[] = [
  'صيانة', 'توصيل', 'تعليم', 'تسوق', 'تقنية', 'مساعدة منزلية', 'رعاية أليفة', 'أخرى'
];

export default function MyQuestsView({
  quests,
  currentUserId,
  lang,
  onPostNewQuest,
  onDeleteCreatedQuest,
  onCancelBookedQuest,
  onUploadProof,
  onConfirmPayout,
  userProfile,
  onAcceptApplicant,
  onViewPublicProfile,
  deferredActiveChat,
  onClearDeferredChat,
  initialTab,
  onClearInitialTab,
  onViewQuestDetail,
  initialSelectedQuestId,
  onClearInitialSelectedQuest,
  onForceReleaseContract,
  onSendPushNotification,
  autoOpenCreate,
  onClearAutoOpenCreate
}: MyQuestsViewProps) {
  const activeQuestCount = userProfile?.hasActiveQuest === false ? 0 : quests.filter(q => q.creatorId === currentUserId && q.status !== 'completed' && q.status !== 'cancelled' && q.status !== 'cancelled_by_timeout' && q.status !== 'stale_cleared').length;
  const [activeTab, setActiveTab ] = useState<'obligations' | 'created'>('obligations');
  const [showHistory, setShowHistory] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Auto show creation modal when triggered from home
  useEffect(() => {
    if (autoOpenCreate) {
      setActiveTab('created');
      setShowCreateModal(true);
      if (onClearAutoOpenCreate) {
        onClearAutoOpenCreate();
      }
    }
  }, [autoOpenCreate, onClearAutoOpenCreate]);
  const [selectedProofQuest, setSelectedProofQuest] = useState<Quest | null>(null);
  const [selectedProofFile, setSelectedProofFile] = useState<string>('https://images.unsplash.com/photo-1513694203232-719a280e022f?w=650&auto=format&fit=crop&q=80');

  // Applicant & Profile Modal states
  const [selectedApplicantData, setSelectedApplicantData] = useState<{ quest: Quest; applicant: Applicant } | null>(null);
  const [deleteConfirmQuestId, setDeleteConfirmQuestId] = useState<string | null>(null);
  
  // Real-time Chat states
  const [activeChat, setActiveChat] = useState<{
    chatId: string;
    questTitle: string;
    recipientName: string;
    recipientAvatar: string;
  } | null>(null);

  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInputText, setChatInputText] = useState('');
  const [liveRecipient, setLiveRecipient] = useState<any | null>(null);
  const [loadingChatMessages, setLoadingChatMessages] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to lowest message on message list updates for instant feel
  useEffect(() => {
    if (chatMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
      // Minor delay to ensure height calculations are correctly completed by browser layout engine
      const timer = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [chatMessages]);

  // Monitor the recipient profile live on activeChat update
  useEffect(() => {
    if (!activeChat) {
      setLiveRecipient(null);
      return;
    }
    const parts = activeChat.chatId.split('_');
    if (parts.length < 3) return;
    const recipientId = currentUserId === parts[1] ? parts[2] : parts[1];

    const recipientRef = doc(db, 'users', recipientId);
    const unsubscribe = onSnapshot(recipientRef, (snapshot) => {
      if (snapshot.exists()) {
        setLiveRecipient(snapshot.data());
      } else {
        setLiveRecipient(null);
      }
    }, (error) => {
      console.warn("Could not load real-time recipient profile in chat:", error);
    });

    return () => unsubscribe();
  }, [activeChat, currentUserId]);

  // Get equipment list for UI rendering dynamically
  const getCategoryEquipment = (category: string) => {
    switch (category) {
      case 'صيانة':
        return [
          lang === 'ar' ? 'حقيبة أدوات الصيانة ومفاتيح الربط' : 'Maintenance tool bag & wrenches',
          lang === 'ar' ? 'مفكات براغي متنوعة وشريط كهربائي واقٍ' : 'Assorted screwdrivers & insulating tape',
          lang === 'ar' ? 'مصباح يدوي وقفازات أمان متينة للعمل الميداني' : 'Flashlight & sturdy work gloves'
        ];
      case 'توصيل':
        return [
          lang === 'ar' ? 'وسيلة نقل مناسبة (دراجة نارية أو سيارة)' : 'Suitable transport vehicle (moto/car)',
          lang === 'ar' ? 'حقيبة ظهر معزولة حرارياً لحماية الطلبات والسلع' : 'Insulated backpack for cargo protection',
          lang === 'ar' ? 'خوذة حماية وهاتف مشحون للتواصل والملاحة' : 'Safety helmet & charged GPS phone'
        ];
      case 'تعليم':
        return [
          lang === 'ar' ? 'جهاز كمبيوتر محمول أو كمبيوتر لوحي للشرح' : 'Laptop or tablet computer for explanation',
          lang === 'ar' ? 'كراس الملاحظات وأقلام ملونة للتوضيح التفاعلي' : 'Notebook & colored explanation markers'
        ];
      case 'تسوق':
        return [
          lang === 'ar' ? 'قائمة المشتريات المحددة ووسيلة دفع مناسبة' : 'Specific shopping list & payment method',
          lang === 'ar' ? 'أكياس تسوق صديقة للبيئة وقابلة لإعادة الاستخدام' : 'Reusable eco-friendly shopping bags'
        ];
      case 'تقنية':
        return [
          lang === 'ar' ? 'جهاز كمبيوتر لابتوب عالي الأداء مع كابلات التوصيل' : 'High-performance laptop & connector cables',
          lang === 'ar' ? 'شاحن سريع ومحركات أقراص USB محمولة لنقل البيانات' : 'Fast charger & flash drives for transfers'
        ];
      case 'مساعدة منزلية':
        return [
          lang === 'ar' ? 'أدوات ومواد تنظيف مخصصة للمنازل' : 'Dedicated residential cleaning materials',
          lang === 'ar' ? 'ممسحة وقفازات مطاطية لحماية الأيدي' : 'Mop & rubber protective gloves'
        ];
      case 'رعاية أليفة':
        return [
          lang === 'ar' ? 'حبل متين لقيادة الحيوانات الأليفة ووعاء للماء' : 'Sturdy pet leash & portable water bowl',
          lang === 'ar' ? 'أكياس مخصصة للتخلص الصحي من الفضلات' : 'Wastes collection bags & dry treats'
        ];
      default:
        return [
          lang === 'ar' ? 'هاتف ذكي متصل بالإنترنت ومفعل للتوجيه الجغرافي' : 'Connected smartphone with GPS activated',
          lang === 'ar' ? 'شاحن طاقة متنقل لحالات الطوارئ الميدانية' : 'Portable power bank for outdoor emergencies'
        ];
    }
  };

  // Handle global 'open-chat' CustomEvent matching
  useEffect(() => {
    const handleOpenChat = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setActiveChat(detail);
      }
    };
    window.addEventListener('open-chat', handleOpenChat);
    return () => window.removeEventListener('open-chat', handleOpenChat);
  }, []);

  // Listen to deferredActiveChat prop changes
  useEffect(() => {
    if (deferredActiveChat) {
      setActiveChat(deferredActiveChat);
      if (onClearDeferredChat) {
        onClearDeferredChat();
      }
    }
  }, [deferredActiveChat, onClearDeferredChat]);

  // Listen to initialTab prop updates and apply, otherwise automate active tab role state
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      if (onClearInitialTab) {
        onClearInitialTab();
      }
    } else {
      if (activeQuestCount > 0) {
        setActiveTab('created');
      } else {
        setActiveTab('obligations');
      }
    }
  }, [initialTab, onClearInitialTab, activeQuestCount]);

  // Scroll and highlight pre-selected quest on created tab
  useEffect(() => {
    if (activeTab === 'created' && initialSelectedQuestId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`quest-${initialSelectedQuestId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const clearTimer = setTimeout(() => {
          if (onClearInitialSelectedQuest) {
            onClearInitialSelectedQuest();
          }
        }, 3500);
        return () => clearTimeout(clearTimer);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [activeTab, initialSelectedQuestId, onClearInitialSelectedQuest]);

  // Listen to Firestore real-time activeChat status
  useEffect(() => {
    if (!activeChat) {
      setChatMessages([]);
      setLoadingChatMessages(false);
      return;
    }

    // Immediately clear previous messages to avoid visual ghosting/delay
    setChatMessages([]);
    setLoadingChatMessages(true);

    if (auth.currentUser) {
      const chatDocRef = doc(db, 'chats', activeChat.chatId);
      const unsubscribe = onSnapshot(chatDocRef, (snapshot) => {
        if (snapshot.exists()) {
          setChatMessages(snapshot.data().messages || []);
        } else {
          setChatMessages([]);
        }
        setLoadingChatMessages(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `chats/${activeChat.chatId}`);
        setLoadingChatMessages(false);
      });

      return () => unsubscribe();
    } else {
      // Local fallback
      try {
        const stored = localStorage.getItem(`local_chat_${activeChat.chatId}`);
        if (stored) {
          const data = JSON.parse(stored);
          setChatMessages(data.messages || []);
        } else {
          // If no local chat history, initialize with a system/welcome msg
          const initMsg = {
            id: 'msg-initb',
            senderId: 'system',
            senderName: 'نظام كويست / System',
            text: lang === 'ar'
              ? `👋 تم بدء المحادثة! يمكنك التنسيق هنا والاتفاق على التفاصيل واللوازم.`
              : `👋 Conversation started! Chat here to align details and equipment.`,
            createdAt: new Date().toISOString()
          };
          setChatMessages([initMsg]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingChatMessages(false);
      }
    }
  }, [activeChat]);

  const handleSendChatMessage = async () => {
    if (!chatInputText.trim() || !activeChat) return;

    const chatParts = activeChat.chatId.split('_');
    const qId = chatParts[0];
    const creatorId = chatParts[1];
    if (currentUserId !== creatorId) {
      const relatedQuest = quests.find(q => q.id === qId);
      const isAssigned = relatedQuest && relatedQuest.helperId === currentUserId && (
        relatedQuest.status === 'booked' ||
        relatedQuest.status === 'active' ||
        relatedQuest.status === 'arrived' ||
        relatedQuest.status === 'pending_verification' ||
        relatedQuest.status === 'completed' ||
        relatedQuest.status === 'disputed'
      );
      if (!isAssigned) {
        setLocalToast(lang === 'ar' 
          ? 'عذراً، لا يمكنك إرسال رسائل لأن العقد لم يتم قبوله أو تعيينه لك بشكل رسمي بعد 🔒' 
          : 'Sorry, you cannot send messages because the contract is not officially accepted or assigned to you yet. 🔒'
        );
        return;
      }
    }

    const newMessage = {
      id: `msg-${Date.now()}`,
      senderId: currentUserId,
      senderName: userProfile.name || 'مستخدم كويست',
      text: chatInputText.trim(),
      createdAt: new Date().toISOString()
    };

    if (auth.currentUser) {
      const chatDocRef = doc(db, 'chats', activeChat.chatId);
      try {
        const snap = await getDoc(chatDocRef);
        let messagesToSave = [newMessage];
        let ownerId = '';
        let applicantId = '';
        let questId = '';

        if (snap.exists()) {
          const chatData = snap.data();
          messagesToSave = [...(chatData.messages || []), newMessage];
          ownerId = chatData.ownerId || '';
          applicantId = chatData.applicantId || '';
          questId = chatData.questId || '';
        } else {
          // Fallback parsing of activeChatId
          const parts = activeChat.chatId.split('_');
          questId = parts[0] || '';
          ownerId = parts[1] || '';
          applicantId = parts[2] || '';
        }

        await setDoc(chatDocRef, {
          id: activeChat.chatId,
          messages: messagesToSave,
          readBy: [currentUserId]
        }, { merge: true });

        // Trigger Contextual Message Notification
        const recipientUserId = (currentUserId === ownerId) ? applicantId : ownerId;
        if (recipientUserId) {
          try {
            const notifDocRef = doc(collection(db, 'notifications'));
            await setDoc(notifDocRef, {
              id: notifDocRef.id,
              userId: recipientUserId,
              text: `رسالة جديدة من ${userProfile.name}: ${newMessage.text} 💬`,
              questId: questId,
              createdAt: new Date().toISOString(),
              read: false,
              type: 'message'
            });

            if (onSendPushNotification) {
              onSendPushNotification(
                recipientUserId,
                lang === 'ar' ? '💬 رسالة جديدة في العقد النشط' : '💬 New Message in Active Contract',
                `${userProfile.name}: ${newMessage.text}`,
                { questId }
              );
            }
          } catch (notifErr) {
            console.error("Failed creating cloud message notification:", notifErr);
          }
        }

        setChatInputText('');
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `chats/${activeChat.chatId}`);
      }
    } else {
      // Local fallback
      try {
        const key = `local_chat_${activeChat.chatId}`;
        const stored = localStorage.getItem(key);
        let messagesToSave = [newMessage];
        if (stored) {
          const parsed = JSON.parse(stored);
          messagesToSave = [...(parsed.messages || []), newMessage];
        } else {
          // Prep-populate with system info if not existing
          const initMsg = {
            id: 'msg-initb',
            senderId: 'system',
            senderName: 'نظام كويست / System',
            text: lang === 'ar'
              ? `👋 تم بدء المحادثة! يمكنك التنسيق هنا والاتفاق على التفاصيل واللوازم.`
              : `👋 Conversation started! Chat here to align details and equipment.`,
            createdAt: new Date().toISOString()
          };
          messagesToSave = [initMsg, newMessage];
        }
        localStorage.setItem(key, JSON.stringify({ id: activeChat.chatId, messages: messagesToSave }));
        setChatMessages(messagesToSave);
        setChatInputText('');

        // Set local storage message notification alert
        try {
          const parts = activeChat.chatId.split('_');
          const questId = parts[0] || '';
          const ownerId = parts[1] || '';
          const applicantId = parts[2] || '';
          const recipientUserId = (currentUserId === ownerId) ? applicantId : ownerId;

          const notifKey = 'local_notifications';
          const storedNotifs = localStorage.getItem(notifKey);
          let list = [];
          if (storedNotifs) {
            list = JSON.parse(storedNotifs);
          }
          list.unshift({
            id: `local-notif-${Date.now()}`,
            userId: recipientUserId,
            text: `رسالة جديدة من ${userProfile.name}: ${newMessage.text} 💬`,
            questId: questId,
            createdAt: new Date().toISOString(),
            read: false,
            type: 'message'
          });
          localStorage.setItem(notifKey, JSON.stringify(list));

          if (onSendPushNotification) {
            onSendPushNotification(
              recipientUserId,
              lang === 'ar' ? '💬 رسالة جديدة في العقد النشط' : '💬 New Message in Active Contract',
              `${userProfile.name}: ${newMessage.text}`,
              { questId }
            );
          }
        } catch (notifLocErr) {
          console.error("Failed creating local storage message notification:", notifLocErr);
        }

      } catch (e) {
        console.error("Local chat send failed: ", e);
      }
    }
  };

  // Local state for UI feedback toast notifications
  const [localToast, setLocalToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setLocalToast(msg);
    setTimeout(() => {
      setLocalToast(prev => prev === msg ? null : prev);
    }, 3000);
  };

  // Form states for hosting quest
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [newCat, setNewCat] = useState<QuestCategory>('صيانة');
  const [newCash, setNewCash] = useState(1500); // default Algerian Dinar price
  const [newUrgency, setNewUrgency] = useState<'normal' | 'urgent' | 'featured'>('normal');
  const [newQuestImages, setNewQuestImages] = useState<string[]>([]);
  const [newRequiredWorkerCount, setNewRequiredWorkerCount] = useState<number>(1);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const handleAutoTagLocation = () => {
    if (!navigator.geolocation) {
      showToast(lang === 'ar' ? '⚠️ تحديد الموقع غير مدعوم في متصفحك!' : '⚠️ Geolocation is not supported by your browser!');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setGpsCoords(coords);
        setGpsLoading(false);
        setNewLoc(`Lat: ${coords.lat.toFixed(5)}, Lng: ${coords.lng.toFixed(5)}`);
        showToast(lang === 'ar' ? '🎯 تم تحديد ونشاط رمز إحداثيات GPS بنجاح!' : '🎯 GPS location coordinates tagged successfully!');
      },
      (error) => {
        console.warn(error);
        setGpsLoading(false);
        setGpsCoords(null);
        setNewLoc('');
        showToast(lang === 'ar' 
          ? "⚠️ عذراً، تعذر التقاط إشارة GPS الحقيقية المادية. يرجى تفعيل الموقع في الهاتف أو الخروج في مكان مفتوح لإتمام العملية."
          : "⚠️ Sorry, could not acquire genuine hardware GPS coordinates. Please enable phone location or step outside into an open space to complete the action."
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  // Refs for native Gallery-only input selectors
  const contractInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  // Simulated upload progress states
  const [bountyUploading, setBountyUploading] = useState(false);
  const [bountyProgress, setBountyProgress] = useState(0);
  const [helperUploading, setHelperUploading] = useState(false);
  const [helperProgress, setHelperProgress] = useState(0);

  // Trigger native Algerian photo gallery select (multiple files)
  const handleAddContractImageSimulated = () => {
    if (newQuestImages.length >= 3) {
      showToast(
        lang === 'ar'
          ? '⚠️ يمكنك إرفاق ما يصل إلى 3 صور كحد أقصى!'
          : '⚠️ You can attach up to 3 images maximum!'
      );
      return;
    }
    if (contractInputRef.current) {
      contractInputRef.current.value = '';
      contractInputRef.current.click();
    }
  };

  // Multiple Image Selection from native device gallery (simulates picker.pickMultiImage())
  const handleContractFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentCount = newQuestImages.length;
    const allowedNewCount = Math.max(0, 3 - currentCount);
    if (allowedNewCount === 0) {
      showToast(
        lang === 'ar'
          ? '⚠️ تم الوصول للحد الأقصى (3 صور)!'
          : '⚠️ Maximum of 3 images reached!'
      );
      return;
    }

    setBountyUploading(true);
    setBountyProgress(5);

    // Limit files to allowedNewCount
    const filesArray = Array.from(files).slice(0, allowedNewCount);
    const fileCount = filesArray.length;
    const compressedUrls: string[] = [];

    try {
      for (let i = 0; i < fileCount; i++) {
        const file = filesArray[i] as File;
        // Calculate dynamic loading progress
        const stepProgress = Math.round(((i + 1) / fileCount) * 80);
        setBountyProgress(stepProgress);
        
        // Expose file to professional 1080x1080 compression at 70% quality factor
        const compressedBase64 = await compressImage(file);

        try {
          // Upload to Firebase Storage with a 2-second timeout to prevent stalling if Storage sits on a cold bucket/permissions hang
          const storageRef = ref(storage, `quests/${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}.jpg`);
          
          await Promise.race([
            uploadString(storageRef, compressedBase64, 'data_url'),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase Storage Timeout")), 2000))
          ]);
          
          const downloadUrl = await getDownloadURL(storageRef);
          compressedUrls.push(downloadUrl);
        } catch (storageErr) {
          console.warn("Storage upload took too long or failed, falling back to local compressed base64 URI", storageErr);
          compressedUrls.push(compressedBase64);
        }
      }

      // Finish smooth progress counter animation
      setBountyProgress(90);
      let p = 90;
      const interval = setInterval(() => {
        p += 5;
        if (p >= 100) {
          clearInterval(interval);
          setBountyUploading(false);
          setNewQuestImages(prev => [...prev, ...compressedUrls]);
          showToast(
            lang === 'ar' 
              ? `📸 تم ضغط وتجهيز ${fileCount} صور بنجاح!` 
              : `📸 Successfully compressed and attached ${fileCount} images!`
          );
        } else {
          setBountyProgress(p);
        }
      }, 60);

    } catch (err: any) {
      console.error(err);
      setBountyUploading(false);
      showToast(lang === 'ar' ? '⚠️ حدث فشل أثناء ضغط ملفات المعرض' : '⚠️ Error compressing selected gallery photographs');
    }
  };

  // Trigger native photo gallery for completion proof
  const handleHelperUploadSimulated = () => {
    if (proofInputRef.current) {
      proofInputRef.current.value = '';
      proofInputRef.current.click();
    }
  };

  // Single Image Selection from native device gallery (simulates picker.pickImage(source: ImageSource.gallery))
  const handleHelperFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setHelperUploading(true);
    setHelperProgress(8);

    try {
      const file = files[0];
      
      // Simulated progressive check
      let progress = 10;
      const interval = setInterval(() => {
        progress += 15;
        if (progress >= 90) {
          clearInterval(interval);
        } else {
          setHelperProgress(progress);
        }
      }, 80);

      // Perform direct offline JPEG quality: 70 & 1080x1080 max-res restriction check
      const compressedDataUrl = await compressImage(file);
      clearInterval(interval);

      setHelperProgress(100);
      setTimeout(() => {
        setHelperUploading(false);
        setSelectedProofFile(compressedDataUrl);
        showToast(
          lang === 'ar'
            ? '📸 تم إدخال الإثبات بنجاح بعد ضغطه وتعديل مقاساته لـ 1080x1080!'
            : '📸 Photo selected from Gallery and compressed to 1080px (70% Quality)!'
        );
      }, 100);

    } catch (err: any) {
      console.error(err);
      setHelperUploading(false);
      showToast(lang === 'ar' ? '⚠️ فشل تحميل وضغط ملف الإثبات' : '⚠️ Verification proof processing failed');
    }
  };

  // Payout star rating variables state
  const [ratingQuestId, setRatingQuestId] = useState<string | null>(null);
  const [ratingVal, setRatingVal] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');

  const dict = translations[lang];
  const isRtl = lang === 'ar';

  const isHistoryStatus = (status: string) => {
    return ['completed', 'cancelled', 'expired', 'cancelled_by_timeout', 'stale_cleared'].includes(status);
  };

  const isActiveStatus = (status: string) => {
    return !isHistoryStatus(status);
  };

  const obligations = quests.filter(q => 
    (q.helperId === currentUserId || q.assignedRunnerId === currentUserId || q.assignedRunnerIds?.includes(currentUserId)) && 
    (showHistory ? isHistoryStatus(q.status) : isActiveStatus(q.status))
  );

  const createdQuests = quests.filter(q => 
    q.creatorId === currentUserId && 
    (showHistory ? isHistoryStatus(q.status) : isActiveStatus(q.status))
  );

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gpsCoords) {
      showToast(lang === 'ar' 
        ? "⚠️ عذراً، تعذر التقاط إشارة GPS الحقيقية المادية. يرجى تفعيل الموقع في الهاتف أو الخروج في مكان مفتوح لإتمام العملية."
        : "⚠️ Sorry, could not acquire genuine hardware GPS coordinates. Please enable phone location or step outside into an open space to complete the action."
      );
      return;
    }
    if (!newTitle || !newDesc) return;

    const lat = gpsCoords.lat;
    const lng = gpsCoords.lng;
    const locString = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;

    onPostNewQuest({
      title: newTitle,
      description: newDesc,
      location: locString,
      category: newCat,
      cashReward: Number(newCash),
      bookingFeeTokens: Math.max(50, Math.round(Number(newCash) * 0.10)),
      urgency: newUrgency,
      lat,
      lng,
      imageUrls: newQuestImages.length > 0 ? newQuestImages : undefined,
      images: newQuestImages.length > 0 ? newQuestImages : undefined,
      imageUrl: newQuestImages.length > 0 ? newQuestImages[0] : undefined,
      locationCoords: { lat, lng },
      requiredWorkerCount: newRequiredWorkerCount,
      assignedRunnerIds: []
    });

    setNewTitle('');
    setNewDesc('');
    setNewLoc('');
    setNewCat('صيانة');
    setNewCash(1500);
    setNewUrgency('normal');
    setNewQuestImages([]);
    setNewRequiredWorkerCount(1);
    setGpsCoords(null);
    setShowCreateModal(false);
    setActiveTab('created');
  };

  const executeProofUpload = () => {
    if (selectedProofQuest) {
      onUploadProof(selectedProofQuest.id, selectedProofFile);
      setSelectedProofQuest(null);
    }
  };

  return (
    <div className="space-y-6 pb-12 font-sans text-[#1F2A44]" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      
      {/* Dynamic Header */}
      <div className="bg-white p-5 rounded-3xl border border-gray-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
        <div>
          <h1 className="text-lg font-black tracking-tight">{lang === 'ar' ? 'لوحة تسيير مهام كويست' : 'Quest Operations Panel'}</h1>
          <p className="text-xs text-gray-400 font-medium">{lang === 'ar' ? 'تابع مسار إنجاز المهام، ورسوم الحجز، وأرسل إثباتات الإنجاز الميدانية' : 'Track current chores, verify KYC documents, and monitor commissions.'}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full sm:w-auto">
          {/* History / Archive Toggle Button */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`font-black text-xs px-5 py-3 rounded-2xl flex items-center justify-center gap-2 border shadow-sm transition-all duration-300 cursor-pointer ${
              showHistory
                ? 'bg-amber-100 border-amber-300 text-amber-800 font-extrabold ring-2 ring-amber-300/50'
                : 'bg-white border-gray-200 text-gray-650 hover:bg-gray-50'
            }`}
          >
            <History className="w-4 h-4 text-current" />
            <span>
              {showHistory
                ? (lang === 'ar' ? 'العقود النشطة 🤝' : 'Active Contracts 🤝')
                : (lang === 'ar' ? 'سجل المهام ⏳' : 'History Log ⏳')}
            </span>
          </button>

          {!showHistory && (
            <div className="flex flex-col items-end gap-1.5 w-full sm:w-auto">
              <button 
                disabled={activeQuestCount > 0}
                onClick={() => {
                  if (activeQuestCount === 0) {
                    setShowCreateModal(true);
                  }
                }}
                className={`font-black text-xs px-5 py-3 rounded-2xl flex items-center gap-2 shadow-md transition-all shrink-0 w-full justify-center sm:w-auto ${
                  activeQuestCount > 0 
                    ? 'bg-gray-200 border border-gray-300 text-gray-400 cursor-not-allowed shadow-none' 
                    : 'bg-[#FF3B7C] hover:bg-[#FF3B7C]/90 text-white cursor-pointer shadow-[#FF3B7C]/20'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>{dict.postNewQuest}</span>
              </button>
              {activeQuestCount > 0 && (
                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 py-1.5 px-3 rounded-xl block text-center animate-pulse w-full">
                  {lang === 'ar' 
                    ? 'لا يمكنك نشر أكثر من مهمة واحدة في نفس الوقت ⚠️' 
                    : lang === 'fr'
                    ? 'Vous ne pouvez publier qu\'une seule tâche active à la fois ⚠️'
                    : 'You can only have one active published quest at a time ⚠️'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Persistent Tabs (The PinnedTabBar) */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200 items-center gap-2">
        {activeQuestCount > 0 ? (
          <>
            {/* Created Tab (Primary state for Poster/Employer mode) */}
            <button
              id="tab-created-active-quest"
              onClick={() => setActiveTab('created')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'created' ? 'bg-[#1F2A44] text-[#FFD34D] shadow-md scale-[1.01]' : 'text-gray-500 hover:text-gray-75'
              }`}
            >
              <Plus className="w-4 h-4 shrink-0 text-[#FFD34D]" />
              <span className="truncate">{dict.createdTab} ({createdQuests.length})</span>
            </button>

            {/* Obligations Tab (Secondary, now equal-sized state) */}
            <button
              id="tab-obligations-active-quest"
              onClick={() => setActiveTab('obligations')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'obligations' ? 'bg-[#1F2A44] text-[#FFD34D] shadow-md scale-[1.01]' : 'text-gray-500 hover:text-gray-75'
              }`}
              title={dict.obigationsTab}
            >
              <Briefcase className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {lang === 'ar' ? 'مهامي 🛠️' : lang === 'fr' ? 'Engagements 🛠️' : 'My Jobs 🛠️'} ({obligations.length})
              </span>
            </button>
          </>
        ) : (
          <>
            {/* Obligations Tab (Primary state for Runner/Worker mode) */}
            <button
              id="tab-obligations-inactive-quest"
              onClick={() => setActiveTab('obligations')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'obligations' ? 'bg-[#1F2A44] text-[#FFD34D] shadow-md scale-[1.01]' : 'text-gray-500 hover:text-gray-75'
              }`}
            >
              <Briefcase className="w-4 h-4 shrink-0 text-[#FFD34D]" />
              <span className="truncate">{dict.obigationsTab} ({obligations.length})</span>
            </button>

            {/* Created Tab (Secondary, now equal-sized state) */}
            <button
              id="tab-created-inactive-quest"
              onClick={() => setActiveTab('created')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'created' ? 'bg-[#1F2A44] text-[#FFD34D] shadow-md scale-[1.01]' : 'text-gray-500 hover:text-gray-75'
              }`}
              title={dict.createdTab}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {lang === 'ar' ? 'طلباتي 💼' : lang === 'fr' ? 'Mes Primes 💼' : 'My Posts 💼'} ({createdQuests.length})
              </span>
            </button>
          </>
        )}
      </div>

      {/* Archive Warning & Indicator and Navigation Back Button */}
      {showHistory && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-amber-900 animate-fadeIn shadow-sm">
          <div className="flex items-center gap-3">
            <History className="w-6 h-6 text-amber-600 shrink-0" />
            <div className="text-start space-y-0.5">
              <span className="text-sm font-black block">
                {lang === 'ar' ? 'أنت تعرض حالياً سجل الأرشيف والتاريخ ⏳' : 'Viewing History & Archived Records ⏳'}
              </span>
              <span className="text-xs text-amber-700/90 font-bold block leading-relaxed">
                {lang === 'ar'
                  ? 'هذه المقالات والعقود مؤرشفة للقراءة فقط ومثبتة رسمياً كأدلة سابقة على الإنجاز.'
                  : 'These are completed, cancelled, or expired read-only contracts.'}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowHistory(false)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-5 py-3 rounded-2xl transition-all cursor-pointer shadow-sm shadow-amber-600/20 active:scale-95 text-center shrink-0 w-full sm:w-auto"
          >
            {lang === 'ar' ? 'الرجوع للعقود النشطة 🤝' : 'Back to Active Contracts 🤝'}
          </button>
        </div>
      )}

      {/* Worker Obligations Mode */}
      {activeTab === 'obligations' && (
        <div className="space-y-4">
          {obligations.length === 0 ? (
            <div className="bg-white py-16 px-4 rounded-3xl border border-gray-150 border-dashed text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto">
                <Briefcase className="w-5 h-5 text-gray-400" />
              </div>
              <h3 className="font-extrabold text-sm">{lang === 'ar' ? 'أنت لا تلتزم بأي مهمة عمل حالياً' : 'No active worker commitments'}</h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                {lang === 'ar' ? 'تصفح كويستات الجزائر بالرئيسية وال خريطة، ادفع 10% رسوم حجز لتبدأ العمل وكسب الدينار الجزائري!' : 'Book standard tasks on home or map view to populate commitments.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {obligations.map((quest) => {
                const isOngoing = quest.status === 'booked' || quest.status === 'arrived';
                const isArrived = quest.status === 'arrived';
                const isUnderReview = quest.status === 'pending_verification';
                const isDisputed = quest.status === 'disputed';
                const isFinished = quest.status === 'completed';

                return (
                  <div 
                    key={quest.id} 
                    className={`bg-white border border-gray-200 p-5 rounded-3xl space-y-4 shadow-sm transition-all duration-300 ${
                      showHistory ? 'grayscale opacity-80 border-slate-200 hover:grayscale-0 hover:opacity-100 bg-slate-50/50' : ''
                    }`}
                  >
                    {/* Upper state details */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-black px-2 py-0.5 rounded bg-amber-100 text-[#1F2A44] uppercase tracking-wider">
                            {quest.category}
                          </span>
                          
                          {/* Live interactive steps tracker */}
                          {isOngoing && !isArrived && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-700">IN PROGRESS 🛠️</span>}
                          {isArrived && <span className="text-[9px] font-black px-2 py-0.5 bg-gradient-to-r from-amber-500 to-rose-500 text-white animate-pulse rounded">ARRIVED AT DESTINATION 🏁</span>}
                          {isUnderReview && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-[#FFD34D] text-[#1F2A44]">SUBMITTED FOR REVIEW ⏳</span>}
                          {isDisputed && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-[#FF3B7C] text-white">UNDER ARBITRATION 🔒</span>}
                          {isFinished && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">RELEASED & COMPLETED ✔️</span>}
                          {quest.createdAt && (
                            <span className="text-[9px] text-slate-500 font-bold flex items-center gap-1 bg-slate-50 border border-slate-200/60 p-0.5 px-2 rounded-md">
                              <span>🕒</span>
                              <span>
                                {lang === 'ar' ? 'نُشرت: ' : lang === 'fr' ? 'Publiée: ' : 'Posted: '}
                                {formatArabicDate(quest.createdAt, lang)}
                              </span>
                            </span>
                          )}
                        </div>
                        <h3 className="font-extrabold text-sm md:text-md leading-snug mt-1">{quest.title}</h3>
                        <div className="text-[11px] text-gray-400 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#4FC3F7]" />
                          <span>{quest.location}</span>
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <span className="text-[#FF3B7C] font-black block text-sm font-mono">{quest.cashReward} DA</span>
                        <span className="text-[9px] text-[#FFD34D] font-extrabold bg-[#1F2A44] px-1.5 py-0.5 rounded">
                          Paid: {quest.bookingFeeTokens} Tokens
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-gray-50 border border-gray-150 rounded-2xl text-xs text-gray-600 leading-relaxed">
                      {quest.description}
                      {quest.imageUrl && (
                        <div className="mt-2.5 overflow-hidden rounded-xl border border-gray-150 max-h-48 bg-gray-100 flex items-center justify-center">
                          <img src={quest.imageUrl} alt={quest.title} className="w-full h-full object-cover max-h-48" />
                        </div>
                      )}
                    </div>

                    {/* Creator's (Employer's) Profile Widget */}
                    {quest.creatorId && (() => {
                      const creatorId = quest.creatorId;
                      const creatorDetails = {
                        userId: creatorId,
                        name: quest.creatorName || (lang === 'ar' ? 'صاحب المهمة 👑' : 'Quest Creator 👑'),
                        avatar: quest.creatorAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${quest.creatorName || 'Owner'}&backgroundColor=111827`,
                        rating: 5.0
                      };
                      return (
                        <div 
                          onClick={() => {
                            if (onViewPublicProfile && creatorId) {
                              onViewPublicProfile(creatorId);
                            }
                          }}
                          className="mt-2.5 flex items-center justify-between p-3.5 bg-sky-500/5 border border-sky-500/25 rounded-2xl cursor-pointer hover:bg-sky-500/10 transition-all active:scale-98"
                        >
                          <div className="flex items-center gap-2.5">
                            <img 
                              src={creatorDetails.avatar} 
                              alt={creatorDetails.name} 
                              className="w-10 h-10 rounded-full object-cover border border-sky-500/20" 
                            />
                            <div className="text-right">
                              <span className="text-[10px] text-gray-400 font-extrabold block">
                                {lang === 'ar' ? 'عرّاب الكويست (صاحب العمل) 👑' : 'Quest Creator & Employer 👑'}
                              </span>
                              <span className="text-xs font-black text-[#1F2A44] hover:underline">
                                {creatorDetails.name}
                              </span>
                            </div>
                          </div>
                          
                          <div className="bg-[#1F2A44] px-2.5 py-1 rounded-xl text-center flex items-center gap-1 text-white">
                            <span className="text-xs font-black font-mono text-[#FFD34D]">★</span>
                            <span className="text-xs font-black font-mono">{creatorDetails.rating}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Direct Coordination Hotline */}
                    {isOngoing && (
                      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3 shadow-inner my-2">
                        <div className="text-[11px] font-black text-emerald-800 flex items-center justify-start gap-2">
                          <PhoneCall className="w-4 h-4 text-emerald-600 animate-pulse" />
                          <span>{lang === 'ar' ? 'خط الاتصال والتنسيق المباشر 📞' : 'Direct Field Coordination Hotline 📞'}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                          {/* Godfather Contact */}
                          <div className="bg-white border border-emerald-100 p-3 rounded-xl flex flex-col justify-between gap-1.5 shadow-sm text-start">
                            <div>
                              <span className="text-[9px] text-[#FF3B7C] font-extrabold block uppercase tracking-wider">
                                {lang === 'ar' ? 'عرّاب الكويست (صاحب العمل) 👑' : 'Godfather (Quest Creator) 👑'}
                              </span>
                              <span className="text-xs font-black text-slate-800 block truncate">{quest.creatorName}</span>
                              <span className="text-xs font-mono font-black text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md inline-block mt-1 col-span-2">
                                {quest.creatorPhone || '0555123456'}
                              </span>
                            </div>
                            <a
                              href={`tel:${quest.creatorPhone || '0555123456'}`}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 rounded-lg text-center flex items-center justify-center gap-1.5 mt-1 transition-all"
                            >
                              <span>📞</span>
                              <span>{lang === 'ar' ? 'اتصال مباشر بصاحب العمل' : 'Call Employer Direct'}</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* User Actions */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      {isOngoing && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('navigate-to-quest-map', {
                                detail: { quest }
                              }));
                            }}
                            className="flex-1 bg-[#4FC3F7] hover:bg-[#38b1e4] text-white font-black text-xs py-3 rounded-2xl cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-[#4FC3F7]/15 text-center"
                          >
                            <span>{lang === 'ar' ? 'إلى التوجيه للموقع 🛰️' : 'Navigate To Spot 🛰️'}</span>
                          </button>

                          <button
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('open-chat', {
                                detail: {
                                  chatId: `${quest.id}_${quest.creatorId}_${currentUserId}`,
                                  questTitle: quest.title,
                                  recipientName: quest.creatorName,
                                  recipientAvatar: quest.creatorAvatar
                                }
                              }));
                            }}
                            className="flex-1 bg-[#1F2A44] hover:bg-[#1E2E4E] text-[#FFD34D] py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 text-center shadow-md shadow-[#1F2A44]/15"
                          >
                            <MessageSquare className="w-4 h-4 text-[#FFD34D]" />
                            <span>{lang === 'ar' ? 'مراسلة 💬' : 'Chat 💬'}</span>
                          </button>
                        </div>
                      )}

                      {/* Supporting actions for ongoing tasks */}
                      {isOngoing && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedProofQuest(quest)}
                            className="flex-1 bg-white hover:bg-[#4FC3F7]/5 text-[#4FC3F7] border border-[#4FC3F7]/30 font-extrabold text-[11px] py-2.5 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'إرفاق إثبات الإنجاز 📸' : 'Upload Completion Proof 📸'}</span>
                          </button>

                          <button
                            onClick={() => {
                              const refundAmount = Math.round(quest.bookingFeeTokens * 0.30);
                              onCancelBookedQuest(quest.id, refundAmount);
                            }}
                            className="bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-650 font-bold text-[10px] px-3 py-2 rounded-xl cursor-pointer transition-all active:scale-101 text-center border border-gray-100"
                          >
                            {lang === 'ar' ? 'إلغاء 🚩' : 'Cancel 🚩'}
                          </button>
                        </div>
                      )}

                      {isUnderReview && (
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 text-center bg-amber-50 rounded-2xl p-3 border border-amber-100 text-[11px] font-bold text-amber-800 animate-pulse">
                            {lang === 'ar' ? 'في انتظار مراجعة صاحب الإعلان للعمل الميداني ⏳' : 'Waiting for Poster to verify work done.'}
                          </div>
                          
                          <button
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('open-chat', {
                                detail: {
                                  chatId: `${quest.id}_${quest.creatorId}_${currentUserId}`,
                                  questTitle: quest.title,
                                  recipientName: quest.creatorName,
                                  recipientAvatar: quest.creatorAvatar
                                }
                              }));
                            }}
                            className="bg-[#1F2A44] hover:bg-[#1E2E4E] text-[#FFD34D] px-4 py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
                          >
                            <MessageSquare className="w-4 h-4 text-[#FFD34D]" />
                            <span>{lang === 'ar' ? 'مراسلة 💬' : 'Chat 💬'}</span>
                          </button>
                        </div>
                      )}

                      {isFinished && (
                        <div className="w-full text-center bg-emerald-50 rounded-2xl p-3 border border-emerald-100 text-[11px] font-bold text-emerald-800 flex items-center justify-center gap-1.5 select-none">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>{lang === 'ar' ? 'اكتملت المهمة! تم تحرير الكاش 💰' : 'Task completed! Peer physical Cash has been released.'}</span>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}

              {/* Applied Pending Quests */}
              {!showHistory && (() => {
                const appliedQuests = quests.filter(q => q.applicants?.some(a => a.userId === currentUserId) && q.status === 'open');
                if (appliedQuests.length === 0) return null;
                return (
                  <div className="space-y-4 pt-6 border-t border-gray-200">
                    <h3 className="text-xs font-black text-slate-500 uppercase flex items-center gap-2 tracking-wider">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span>{lang === 'ar' ? 'مهام قيد التقديم (في انتظار موافقة صاحب العمل) ⏳' : 'Applied Quests (Pending Approval) ⏳'}</span>
                    </h3>
                    <div className="grid gap-4">
                      {appliedQuests.map((quest) => (
                        <div key={quest.id} className="bg-slate-50 border border-slate-200 p-5 rounded-3xl space-y-3 shadow-sm">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <span className="text-[9px] font-black px-2 py-0.5 rounded bg-amber-100 text-[#1F2A44] uppercase">
                                {quest.category}
                              </span>
                              <h4 className="font-extrabold text-sm ml-1 mt-1 text-slate-950">{quest.title}</h4>
                              <p className="text-[11px] text-gray-400 mt-0.5">{quest.location}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-[#FF3B7C] font-black block text-sm font-mono">{quest.cashReward} DA</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled
                              className="flex-1 bg-slate-200 text-slate-500 font-extrabold text-[11px] py-2.5 rounded-xl cursor-default text-center"
                            >
                              <span>{lang === 'ar' ? 'تم التقديم بنجاح.. في انتظار صاحب العمل 🤝' : 'Applied.. waiting selection'}</span>
                            </button>
                            <button
                              disabled
                              title={lang === 'ar' ? 'تفتح المحادثة تلقائياً بمجرد تعيينك وتفعيل العقد لحماية خصوصية الطرفين.' : 'Chat unlocks after contract assignment.'}
                              className="bg-slate-300 text-slate-500 px-4 py-2.5 rounded-xl text-xs font-black cursor-not-allowed flex items-center gap-1.5 opacity-60"
                            >
                              <Lock className="w-4 h-4 text-slate-400" />
                              <span>{lang === 'ar' ? 'الدردشة مغلقة 🔒' : 'Chat Locked 🔒'}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Poster Mode */}
      {activeTab === 'created' && (
        <div className="space-y-4">
          {createdQuests.length === 0 ? (
            <div className="bg-white py-16 px-4 rounded-3xl border border-gray-150 border-dashed text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mx-auto">
                <Plus className="w-5 h-5 text-gray-400" />
              </div>
              <h3 className="font-extrabold text-sm">{lang === 'ar' ? 'لم تقم بنشر أي كويست سابقاً' : 'No hosted chores listed'}</h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                {lang === 'ar' ? 'انشر طلباً لمساعدة الجيران في الجزائر! حدد مكافأة نقدية بالدينار الجزائري، ودع الرَّانَرز يلبون النداء.' : 'Post custom chores in Algeria to hire youth runner assistants today.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {createdQuests.map((quest) => {
                const isAvailable = quest.status === 'open';
                const isClaimed = quest.status === 'booked';
                const isSubmitted = quest.status === 'pending_verification';
                const isFinished = quest.status === 'completed';

                return (
                  <div
                    key={quest.id}
                    id={`quest-${quest.id}`}
                    className={`bg-white border p-5 rounded-3xl space-y-4 shadow-sm transition-all duration-350 ${
                      showHistory 
                        ? 'grayscale opacity-80 border-slate-200 hover:grayscale-0 hover:opacity-100 bg-slate-50/50' 
                        : initialSelectedQuestId === quest.id
                        ? 'border-[#FF3B7C] ring-4 ring-[#FF3B7C]/15 scale-[1.01]'
                        : 'border-gray-250/70'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-black px-2 py-0.5 rounded bg-gray-100 text-[#1F2A44]">
                            {quest.category}
                          </span>
                          {isAvailable && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-sky-100 text-sky-800 uppercase">Available 🌍</span>}
                          {isClaimed && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-800">Claimed 🛠️</span>}
                          {isSubmitted && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-[#FFD34D] text-[#1F2A44] animate-pulse">SUBMITTED PROOF RAISING 🚨</span>}
                          {isFinished && <span className="text-[9px] font-black px-2 py-0.5 rounded bg-emerald-150 text-emerald-950">COMPLETED ✔️</span>}
                          {quest.createdAt && (
                            <span className="text-[9px] text-slate-500 font-bold flex items-center gap-1 bg-slate-50 border border-slate-200/60 p-0.5 px-2 rounded-md">
                              <span>🕒</span>
                              <span>
                                {lang === 'ar' ? 'نُشرت: ' : lang === 'fr' ? 'Publiée: ' : 'Posted: '}
                                {formatArabicDate(quest.createdAt, lang)}
                              </span>
                            </span>
                          )}
                        </div>
                        <h3 className={`font-extrabold text-sm leading-snug transition-colors duration-300 ${isClaimed ? 'text-[#FF3B7C]' : 'text-[#1F2A44]'}`}>{quest.title}</h3>
                        <div className="text-[11px] text-gray-400 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#4FC3F7]" />
                          <span>{quest.location}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[#FF3B7C] font-black text-sm block font-mono">{quest.cashReward} DA</span>
                        <span className="text-[9px] text-[#4FC3F7] font-bold">Coords: {quest.lat.toFixed(3)} {quest.lng.toFixed(3)}</span>
                      </div>
                    </div>

                    <p className="p-3 bg-gray-50 rounded-2xl text-xs text-gray-500 leading-relaxed border border-gray-100">
                      {quest.description}
                      {quest.imageUrl && (
                        <span className="mt-2.5 block overflow-hidden rounded-xl border border-gray-150 max-h-48 bg-gray-100 flex items-center justify-center">
                          <img src={quest.imageUrl} alt={quest.title} className="w-full h-full object-cover max-h-48" />
                        </span>
                      )}
                    </p>

                    {/* Hired Worker's Profile Widget */}
                    {(quest.helperId || quest.assignedRunnerId) && (() => {
                      const runnerId = quest.helperId || quest.assignedRunnerId;
                      const hiredRunner = quest.applicants?.find(a => a.userId === runnerId) || {
                        userId: runnerId,
                        name: quest.helperName || (lang === 'ar' ? 'العامل المعيَّن 🏃‍♂️' : 'Hired Assistant 🏃‍♂️'),
                        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${quest.helperName || 'Runner'}&backgroundColor=f43f5e`,
                        rating: 4.9
                      };
                      return (
                        <div 
                          onClick={() => {
                            if (onViewPublicProfile && runnerId) {
                              onViewPublicProfile(runnerId);
                            }
                          }}
                          className="mt-2.5 flex items-center justify-between p-3.5 bg-[#FF3B7C]/5 border border-[#FF3B7C]/25 rounded-2xl cursor-pointer hover:bg-[#FF3B7C]/10 transition-all active:scale-98"
                        >
                          <div className="flex items-center gap-2.5">
                            <img 
                              src={hiredRunner.avatar} 
                              alt={hiredRunner.name} 
                              className="w-10 h-10 rounded-full object-cover border border-[#FF3B7C]/20" 
                            />
                            <div className="text-right">
                              <span className="text-[10px] text-gray-400 font-extrabold block">
                                {lang === 'ar' ? 'المساعد الميداني المعيَّن 🏃‍♂️' : 'Hired field assistant 🏃‍♂️'}
                              </span>
                              <span className="text-xs font-black text-[#1F2A44] hover:underline">
                                {hiredRunner.name}
                              </span>
                            </div>
                          </div>
                          
                          <div className="bg-[#1F2A44] px-2.5 py-1 rounded-xl text-center flex items-center gap-1 text-white">
                            <span className="text-xs font-black font-mono text-[#FFD34D]">★</span>
                            <span className="text-xs font-black font-mono">{hiredRunner.rating || '4.9'}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Applicants pipeline list */}
                    {isAvailable && quest.applicants && quest.applicants.length > 0 && (
                      <div className="p-4 bg-[#1F2A44]/5 border border-[#1F2A44]/15 rounded-2xl space-y-3">
                        <div className="text-[11px] font-black text-[#1F2A44] flex items-center gap-2">
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3B7C] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3B7C]"></span>
                          </span>
                          <span>{lang === 'ar' ? `المتقدمون لهذه المهمة (${quest.applicants.length})` : `Hunters applied (${quest.applicants.length})`}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {quest.applicants.map((app) => (
                            <button
                              key={app.userId}
                              onClick={() => setSelectedApplicantData({ quest, applicant: app })}
                              className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 py-2 px-4 rounded-full text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                            >
                              <img src={app.avatar} alt={app.name} className="w-5 h-5 rounded-full object-cover" />
                              <span className="text-slate-800 font-extrabold">{app.name}</span>
                              <span className="text-[11px] text-amber-500 font-extrabold font-mono">★ {app.rating || '5.0'}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pending proof view for creator verification */}
                    {isSubmitted && quest.proofImageUrl && (
                      <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-3">
                        <div className="text-[10px] font-extrabold text-amber-800 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-600 fill-amber-500" />
                          <span>Runner uploaded visual completion proof. Review image below:</span>
                        </div>
                        <img 
                          src={quest.proofImageUrl} 
                          alt="Proof of completion"
                          className="w-full h-36 object-cover rounded-xl border border-amber-200"
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-1 border-t border-gray-50 flex-col sm:flex-row w-full">
                      {(((quest.status as string) === 'pending' || quest.status === 'open' || !quest.assignedRunnerId) && !quest.helperId && !showHistory) && (
                        <button
                          id={`delete-quest-btn-${quest.id}`}
                          onClick={() => setDeleteConfirmQuestId(quest.id)}
                          className="flex-1 bg-[#FF3B7C]/10 hover:bg-[#FF3B7C]/15 text-[#FF3B7C] border border-[#FF3B7C]/30 font-black text-xs py-3 rounded-2xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95 hover:scale-[1.01]"
                        >
                          <Trash2 className="w-4 h-4 text-[#FF3B7C]" />
                          <span>{lang === 'ar' ? 'حذف وإلغاء هذا المنشور 🗑️' : 'Delete & Cancel This Post 🗑️'}</span>
                        </button>
                      )}

                      {isClaimed && (
                        <div className="w-full space-y-3">
                          <div className="w-full text-center text-xs text-blue-700 bg-blue-50 border border-blue-100 p-4 rounded-2xl font-bold flex flex-col gap-1.5 leading-relaxed">
                            <span>
                              {lang === 'ar' ? 'تم حجز الكويست بواسطة الرَّانر: ' : 'Assigned to runner: '}
                              <strong className="text-blue-900 underline">{quest.helperName}</strong>.
                            </span>
                            <span className="text-[10px] text-gray-500 font-medium font-sans">
                              {lang === 'ar' ? 'العقد مغلق حالياً بانتظار تقدم المساعد الميداني.' : 'Contract is locked pending field progress.'}
                            </span>
                            {quest.assignedAt && (
                              <span className="text-[10px] text-blue-800 font-bold bg-blue-100/40 py-1 px-3 mt-1.5 rounded-xl inline-flex items-center justify-center gap-1.5 self-center">
                                <span>📅</span>
                                <span>
                                  {lang === 'ar' ? 'بدأ العقد: ' : lang === 'fr' ? 'Contrat démarré: ' : 'Contract started: '}
                                  {formatArabicDate(quest.assignedAt, lang)}
                                </span>
                              </span>
                            )}
                          </div>

                          {/* Direct Coordination Hotline (Feature 6 Option) */}
                          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3 shadow-inner my-2">
                            <div className="text-[11px] font-black text-emerald-800 flex items-center justify-start gap-2">
                              <PhoneCall className="w-4 h-4 text-emerald-600 animate-pulse" />
                              <span>{lang === 'ar' ? 'خط الاتصال والتنسيق المباشر 📞' : 'Direct Field Coordination Hotline 📞'}</span>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-3">
                              {/* Runner Contact */}
                              <div className="bg-white border border-emerald-100 p-3 rounded-xl flex flex-col justify-between gap-1.5 shadow-sm text-start">
                                <div>
                                  <span className="text-[9px] text-[#4FC3F7] font-extrabold block uppercase tracking-wider">
                                    {lang === 'ar' ? 'الرَّانر المعيَّن 🏃‍♂️' : 'Assigned Runner 🏃‍♂️'}
                                  </span>
                                  <span className="text-xs font-black text-slate-800 block truncate">{quest.helperName || 'صياد كويست'}</span>
                                  <span className="text-xs font-mono font-black text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md inline-block mt-1">
                                    {quest.helperPhone || '0555123456'}
                                  </span>
                                </div>
                                <a
                                  href={`tel:${quest.helperPhone || '0555123456'}`}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 rounded-lg text-center flex items-center justify-center gap-1.5 mt-1 transition-all"
                                >
                                  <span>📞</span>
                                  <span>{lang === 'ar' ? 'اتصال مباشر بالرَّانر المعيّن' : 'Call Assigned Runner'}</span>
                                </a>
                              </div>
                            </div>
                          </div>

                          {/* Emergency Rescue/Force Release Button */}
                          {(() => {
                            const assignTime = quest.assignedAt ? new Date(quest.assignedAt).getTime() : new Date(quest.createdAt).getTime();
                            const timeElapsed = new Date().getTime() - assignTime;
                            const isOld = timeElapsed >= 24 * 60 * 60 * 1000;
                            const timeLeftMs = (24 * 60 * 60 * 1000) - timeElapsed;
                            const timeLeftHours = Math.max(0, Math.ceil(timeLeftMs / (1000 * 60 * 60)));

                            if (isOld) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(lang === 'ar' ? 'هل أنت متأكد من رغبتك في إلغاء العقد وفك الحظر وإعادة الرموز؟' : 'Are you sure you want to cancel the contract, unblock, and refund tokens?')) {
                                      if (onForceReleaseContract) {
                                        onForceReleaseContract(quest.id);
                                      }
                                    }
                                  }}
                                  className="w-full bg-[#FF3B7C] hover:bg-red-750 text-white font-extrabold text-xs py-3 rounded-2xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-red-500/15"
                                >
                                  <span>🚨 {lang === 'ar' ? 'إلغاء العقد المعلق وفك الحظر' : 'Cancel Pend Contract & Unblock'}</span>
                                </button>
                              );
                            } else {
                              return (
                                <div className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm(lang === 'ar' ? '📝 ميزة الحماية: تتوفر خاصية التحرير التلقائي الفوري لمجتمع المختبرين حالياً للتسريع. هل تريد استخدام تجاوز الإنقاذ الطارئ فك الارتباط الاستباقي الآن؟' : '📝 Debug Override: Fast Emergency Bypass is unlocked for beta testers. Force release now?')) {
                                        if (onForceReleaseContract) {
                                          onForceReleaseContract(quest.id);
                                        }
                                      }
                                    }}
                                    className="w-full bg-[#FF3B7C]/10 text-[#FF3B7C] hover:bg-[#FF3B7C]/20 font-black text-xs py-3 rounded-2xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5"
                                  >
                                    <span>🚨 {lang === 'ar' ? 'إلغاء العقد المعلق وفك الحظر (إنقاذ طارئ)' : 'Force Release & Cancel Contract'}</span>
                                  </button>
                                  <div className="text-[10px] text-gray-400 font-bold text-center">
                                    {lang === 'ar' 
                                      ? `الموعد التلقائي للتحرير النهائي بعد ${timeLeftHours} ساعة في حال عدم الجدية.` 
                                      : `Contract standard force release unlocks in ${timeLeftHours} hour(s) if no proof is uploaded.`}
                                  </div>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      )}

                      {isSubmitted && (
                        <div className="w-full space-y-2">
                          <button
                            onClick={() => {
                              setRatingQuestId(quest.id);
                              setRatingVal(5);
                              setRatingComment('');
                            }}
                            className="w-full bg-[#1F2A44] text-[#FFD34D] font-extrabold text-xs py-3 rounded-xl hover:bg-[#1E2E4E] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-[#1F2A44]/20"
                          >
                            <CheckCircle2 className="w-4 h-4 text-[#FFD34D]" />
                            <span>Confirm and Release Tokens & DZD Cash</span>
                          </button>
                          <p className="text-[10px] text-gray-400 text-center font-bold">
                            Review physical work on ground, then click confirm to award XP and finalize transaction.
                          </p>
                        </div>
                      )}

                      {isFinished && (
                        <div className="w-full text-center bg-gray-50 py-2.5 rounded-xl text-xs text-gray-400 font-bold border border-gray-150">
                          Complete! Cash paid on ground + Platform fee logged successfully.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete/Cancel Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmQuestId && (
          <div className="fixed inset-0 bg-[#1F2A44]/80 backdrop-blur-md flex items-center justify-center p-4 z-[99]" id="delete-confirm-modal">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl border border-gray-150"
            >
              <div className="w-12 h-12 bg-red-50 text-[#FF3B7C] rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              
              <h3 className="text-sm font-black tracking-wider text-[#1F2A44]" id="delete-modal-title">
                {lang === 'ar' ? 'هل أنت متأكد من حذف وإلغاء هذا الكويست؟' : 'Are you sure you want to delete and cancel this quest?'}
              </h3>
              
              <p className="text-xs text-gray-400 font-bold leading-relaxed">
                {lang === 'ar' 
                  ? 'سيتم إلغاء المنشور وإزالته نهائياً من قائمة الطلبات المتاحة، وستتم إعادة الرموز (Tokens) المستقطعة بالكامل وبشكل فوري إلى رصيدك.' 
                  : 'This post will be permanently canceled and removed, and all booking tokens will be refunded into your token balance immediately.'}
              </p>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  id="delete-modal-cancel"
                  onClick={() => setDeleteConfirmQuestId(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-150 hover:text-gray-700 text-gray-500 font-extrabold text-xs py-3 rounded-2xl transition-all cursor-pointer"
                >
                  {lang === 'ar' ? 'تراجع ✕' : 'Cancel ✕'}
                </button>
                <button
                  type="button"
                  id="delete-modal-confirm"
                  onClick={() => {
                    const qId = deleteConfirmQuestId;
                    setDeleteConfirmQuestId(null);
                    onDeleteCreatedQuest(qId);
                  }}
                  className="flex-1 bg-[#FF3B7C] hover:bg-[#FF3B7C]/90 text-white font-extrabold text-xs py-3 rounded-2xl transition-all cursor-pointer shadow-md shadow-[#FF3B7C]/20"
                >
                  {lang === 'ar' ? 'نعم، حذف 🗑️' : 'Yes, Delete 🗑️'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Proof Submission Modal */}
      <AnimatePresence>
        {selectedProofQuest && (
          <div className="fixed inset-0 bg-[#1F2A44]/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl border border-gray-150"
            >
              <div className="w-12 h-12 bg-[#4FC3F7]/10 text-[#4FC3F7] rounded-full flex items-center justify-center mx-auto">
                <Camera className="w-6 h-6 text-[#4FC3F7]" />
              </div>
              
              <h3 className="text-xs font-black tracking-wider uppercase text-[#1F2A44]">
                {lang === 'ar' ? 'إرفاق إثبات العمل الميداني' : 'Attach Photographic Proof of Completion'}
              </h3>
              
              <p className="text-[11px] text-gray-400 font-medium leading-relaxed">
                {lang === 'ar' 
                  ? 'يرجى التقاط أو اختيار صورة توضح تسليم الأغراض أو إتمام العمل ليقوم منشئ الكويست بإطلاق المبلغ النامي.' 
                  : 'Submit a real-time photograph showing the completed work. The Godfather will view this to release your cash reward.'}
              </p>

              {/* Sky Blue Camera Upload Zone */}
              <input 
                type="file" 
                id="helper-proof-picker"
                ref={proofInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleHelperFileChange}
              />

              <label
                htmlFor="helper-proof-picker"
                className={`w-full h-36 rounded-2xl border-2 border-dashed border-[#4FC3F7] bg-sky-50/30 hover:bg-sky-50/50 flex flex-col items-center justify-center p-4 transition-all active:scale-98 cursor-pointer relative overflow-hidden select-none block ${helperUploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                {helperUploading ? (
                  <div className="space-y-2 w-full flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full border-2 border-t-[#4FC3F7] border-gray-200 animate-spin flex items-center justify-center">
                      <span className="text-[8px] text-[#4FC3F7] font-black">{helperProgress}%</span>
                    </div>
                    <span className="text-[10px] text-[#4FC3F7] font-extrabold px-3 py-1 bg-white rounded-full shadow-sm">
                      Compressing gallery image...
                    </span>
                    <div className="w-2/3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="bg-[#4FC3F7] h-full transition-all duration-100" style={{ width: `${helperProgress}%` }}></div>
                    </div>
                  </div>
                ) : selectedProofFile ? (
                  <div className="absolute inset-0">
                    <img src={selectedProofFile} className="w-full h-full object-cover" alt="Selected proof preview" />
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white">
                      <Camera className="w-6 h-6 mb-1 text-[#4FC3F7]" />
                      <span className="text-[10px] font-black uppercase tracking-wider bg-[#4FC3F7] text-white px-2.5 py-1 rounded-full">
                        {lang === 'ar' ? 'تغيير صورة الإثبات' : 'Change completion photo'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-center">
                    <div className="w-10 h-10 rounded-full bg-[#4FC3F7]/10 text-[#4FC3F7] flex items-center justify-center mx-auto">
                      <Image className="w-5 h-5 mx-auto" />
                    </div>
                    <span className="text-xs font-black text-[#4FC3F7] block">
                      {lang === 'ar' ? 'افتح الهاتف لاختيار إثبات العمل' : 'Select Proof from Gallery'}
                    </span>
                    <span className="text-[9px] text-gray-400 block uppercase font-mono">Native Photo Gallery ONLY</span>
                  </div>
                )}
              </label>

              {/* Sample Quick Presets Picker */}
              <div className="space-y-1 text-left">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wide block">
                  {lang === 'ar' ? 'أو اختر من المعرض السريع:' : 'Or tap quick demo files:'}
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=300&auto=format&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=300&auto=format&fit=crop&q=80'
                  ].map((img, i) => (
                    <button 
                      key={i} 
                      type="button"
                      onClick={() => setSelectedProofFile(img)}
                      className={`h-11 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                        selectedProofFile === img ? 'border-[#FF3B7C] scale-95 ring-2 ring-[#FF3B7C]/20' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} className="w-full h-full object-cover" alt="sample" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={executeProofUpload}
                  disabled={helperUploading}
                  className="w-full bg-[#1F2A44] hover:bg-[#2c3c61] text-[#FFD34D] font-extrabold text-xs py-3 rounded-xl transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {lang === 'ar' ? 'إرسال الملف للإثبات الفوري' : 'Lock Proof and Submit Chores'}
                </button>
                <button
                  onClick={() => setSelectedProofQuest(null)}
                  className="w-full text-gray-400 hover:text-gray-600 text-[10px] font-semibold cursor-pointer"
                >
                  {dict.cancelBtn}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form Modal: Host Quest */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-[#1F2A44]/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl"
            >
              <div className="bg-[#1F2A44] text-white p-5 flex justify-between items-center">
                <div>
                  <h3 className="font-extrabold text-sm">{dict.createNewQuestTitle}</h3>
                  <p className="text-[10px] text-gray-300 font-semibold">{dict.verifyNote}</p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full text-white cursor-pointer select-none">
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">{dict.titleLabel}</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. صيانة مكيف بالجزائر العاصمة..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">{dict.descLabel}</label>
                  <textarea 
                    required 
                    rows={2}
                    placeholder="e.g. نأمل إحضار مفتاح رقم ١٢..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none"
                  />
                </div>

                <div className="space-y-2 p-3.5 bg-gray-50 rounded-2xl border border-gray-150 text-start">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-gray-500 uppercase">{lang === 'ar' ? 'تحديد إحداثيات الموقع (مستشعر GPS المادي)' : 'Acquire GPS Position (hardware sensor only)'}</label>
                    <button
                      type="button"
                      onClick={handleAutoTagLocation}
                      className="px-3 py-1.5 rounded-lg bg-[#FF3B7C] text-white text-[10px] font-black flex items-center gap-1 hover:bg-[#FF3B7C]/95 transition-all cursor-pointer shadow-xs border-none"
                    >
                      <span>{gpsLoading ? (lang === 'ar' ? 'جاري التحديد...' : 'Tagging...') : (lang === 'ar' ? '🎯 تلقائي GPS' : '🎯 Auto-Tag GPS')}</span>
                    </button>
                  </div>
                  {gpsCoords ? (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-[10px] text-emerald-700 font-extrabold flex justify-between items-center animate-in fade-in">
                      <span className="font-mono tracking-wider">Tagged: {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}</span>
                      <span className="text-[8px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{lang === 'ar' ? 'دقيق ومتصل' : 'Verified GPS'}</span>
                    </div>
                  ) : (
                    <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl text-[9px] text-[#FF3B7C] font-semibold">
                      {lang === 'ar' ? '⚠️ لم يتم تحديد إحداثيات حقيقية بعد. يرجى الضغط على زر تلقائي GPS لتفعيل المستشعر وإتمام نشر العقد.' : '⚠️ No verified coordinates tagged. Press Auto-Tag GPS to activate the sensor and enable posting.'}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase">{dict.categoryLabel}</label>
                    <select 
                      value={newCat} 
                      onChange={(e) => setNewCat(e.target.value as QuestCategory)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                    >
                      {CATEGORIES_LIST.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase">urgency tier</label>
                    <select 
                      value={newUrgency} 
                      onChange={(e) => setNewUrgency(e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold"
                    >
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent 🔥</option>
                      <option value="featured">Featured ⭐</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">{dict.cashLabel}</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      min="500" 
                      max="10000" 
                      required
                      value={newCash}
                      onChange={(e) => setNewCash(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black font-mono focus:outline-none"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-extrabold text-[11px] mr-[100px]">DZD (DA)</span>
                  </div>
                  <p className="text-[9px] text-[#FF3B7C] font-extrabold">
                    10% platform fee deduction (min 50): ⚡ {Math.max(50, Math.round(newCash * 0.10))} tokens deducted from Runner on book.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase">
                    {lang === 'ar' ? 'عدد المساعدين الميدانيين المطلوبين 👥' : 'Required Field Assistants 👥'}
                  </label>
                  <input 
                    type="number" 
                    min="1" 
                    max="5"
                    required
                    value={newRequiredWorkerCount}
                    onChange={(e) => setNewRequiredWorkerCount(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black font-mono focus:outline-none"
                  />
                  <p className="text-[9px] text-slate-400 font-medium leading-none">
                    {lang === 'ar' 
                      ? 'يمكنك قبول وتوظيف عدة مساعدين حتى تكتمل الحصص المخصصة لمهمتك.'
                      : 'You can hire multiple assistants until the assigned helper list matches your required count.'}
                  </p>
                </div>

                {/* Godfather's Contract Multi-Media Support */}
                <div className="space-y-3 border-t border-gray-100 pt-3">
                  <span className="text-[10px] font-black text-gray-500 uppercase block tracking-wider">
                    📸 {lang === 'ar' ? 'صور عقد الكويست الميداني (صور السلع أو الموقع)' : 'Quest Contract Photos (Delivery Goods or Work Site)'}
                  </span>

                  <div className="grid grid-cols-3 gap-2.5">
                    {/* Hidden Native Multiple Gallery Selector (Simulation of pickMultiImage) */}
                    <input 
                      type="file" 
                      id="contract-image-picker"
                      ref={contractInputRef}
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleContractFileChange}
                    />

                    {/* Sky Blue dashed contract uploader trigger */}
                    <label
                      htmlFor="contract-image-picker"
                      className={`h-16 rounded-xl border-2 border-dashed border-[#4FC3F7] bg-sky-50/40 hover:bg-sky-55 flex flex-col items-center justify-center p-1 cursor-pointer transition-all active:scale-95 text-center group font-black select-none block ${bountyUploading ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      {bountyUploading ? (
                        <div className="space-y-1">
                          <span className="text-[10px] text-[#4FC3F7] animate-pulse block">Compressing...</span>
                          <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden mx-auto">
                            <div className="bg-[#4FC3F7] h-full transition-all" style={{ width: `${bountyProgress}%` }}></div>
                          </div>
                          <span className="text-[8px] text-gray-400 block">{bountyProgress}%</span>
                        </div>
                      ) : (
                        <>
                          <Image className="w-5 h-5 text-[#4FC3F7] mx-auto" />
                          <span className="text-[8.5px] text-[#4FC3F7] font-black mt-1 leading-tight block">
                            {lang === 'ar' ? 'معرض الصور' : 'Device Gallery'}
                          </span>
                        </>
                      )}
                    </label>

                    {/* Pre-uploaded preview list inside the grid */}
                    {newQuestImages.map((url, idx) => (
                      <div key={idx} className="h-16 rounded-xl overflow-hidden border border-gray-200 relative group bg-gray-50 shadow-xs">
                        <img src={url} alt={`Quest upload ${idx}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setNewQuestImages(newQuestImages.filter((_, i) => i !== idx))}
                          className="absolute -top-1 -right-1 bg-[#FF3B7C] text-white rounded-full w-4 h-4 text-[9px] font-black flex items-center justify-center shadow-md select-none hover:bg-red-700"
                        >
                          ✕
                        </button>
                        <div className="absolute bottom-0 inset-x-0 bg-black/40 text-[7px] text-white font-extrabold text-center py-0.5">
                          IMAGE {idx + 1}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-[9px] text-gray-400 font-medium leading-relaxed">
                    {lang === 'ar' 
                      ? 'يمكنك إضافة صور توضيحية لسلع التوصيل، موقع العمل، أو الأجهزة لتمكين الرَّانر من معاينة الاحتياجات بوضوح.' 
                      : 'Upload photos showing the package, items to buy, or site to clean. This builds bulletproof visual contracts.'}
                  </p>
                </div>

                 <div className="space-y-2 pt-2">
                   <button 
                     type="submit" 
                     disabled={!gpsCoords}
                     className={`w-full font-black py-3 rounded-xl text-xs shadow-md select-none transition-all ${
                       gpsCoords 
                         ? 'bg-[#1F2A44] text-[#FFD34D] cursor-pointer hover:bg-[#1A253C]' 
                         : 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                     }`}
                   >
                     {gpsCoords 
                       ? dict.submitPost 
                       : (lang === 'ar' ? '⚠️ يرجى تحديد موقع GPS المادي للنشر' : '⚠️ Acquire GPS Position first')}
                   </button>
                   <button type="button" onClick={() => setShowCreateModal(false)} className="w-full text-gray-400 hover:text-gray-600 text-[10px] font-bold py-2.5">
                     {dict.cancelBtn}
                   </button>
                 </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Interactive Godfather Rating Review popup dialog upon Confirm Payout */}
      <AnimatePresence>
        {ratingQuestId && (
          <div className="fixed inset-0 bg-[#1F2A44]/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-gray-150 text-center"
            >
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500">
                <Star className="w-6 h-6 fill-amber-500 text-amber-500" />
              </div>
              
              <h3 className="text-sm font-black uppercase text-[#1F2A44]">
                {lang === 'ar' ? 'تأكيد التسليم وتقييم أداء الرانر' : 'Confirm & Review Mercenary'}
              </h3>
              
              <p className="text-xs text-slate-400 font-bold leading-normal">
                {lang === 'ar' 
                  ? 'يرجى وضع مراجعتك وتقييمك ليعزز بورتفوليو الرانر ويُسهم في رفع ترتيبه في قائمة المتصدرين الوطنية.' 
                  : 'Submit a verified star rating and testimonial statement to permanently endorse the runner in their public social portfolio.'}
              </p>

              {/* Stars selection */}
              <div className="flex items-center justify-center gap-2 pt-1">
                {[1, 2, 3, 4, 5].map((starVal) => (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => setRatingVal(starVal)}
                    className="p-1 cursor-pointer transition-all active:scale-125 select-none"
                  >
                    <Star 
                      className={`w-7 h-7 transition-colors ${
                        starVal <= ratingVal ? 'fill-[#FFD34D] text-[#FFD34D]' : 'text-gray-200'
                      }`} 
                    />
                  </button>
                ))}
              </div>

              {/* Testimonial comments text shape */}
              <div className="space-y-1 text-right">
                <label className="text-[9px] font-black text-gray-400 uppercase">
                  {lang === 'ar' ? 'كلمة شكر وشهادة عمل بالتجربة' : 'Godfather Testimonial Comment'}
                </label>
                <textarea
                  rows={2}
                  maxLength={140}
                  placeholder={lang === 'ar' ? 'مثال: أداء رائع وسريع في الموعد أنصح به!' : 'e.g. Excellent work and super polite! Highest yield recommendation.'}
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none"
                />
              </div>

              {/* Confirmation CTAs */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    onConfirmPayout(ratingQuestId, ratingVal, ratingComment);
                    setRatingQuestId(null);
                  }}
                  className="w-full bg-[#1F2A44] hover:bg-[#1E2E4E] text-[#FFD34D] font-extrabold text-xs py-3 rounded-xl transition-all cursor-pointer shadow-md shadow-[#1F2A44]/15"
                >
                  {lang === 'ar' ? 'تأكيد التسليم النهائي وحفظ التقييم' : 'Finalize Contract & Write Review'}
                </button>
                <button
                  onClick={() => setRatingQuestId(null)}
                  className="w-full text-gray-400 hover:text-gray-600 text-[10px] font-semibold cursor-pointer py-1"
                >
                  {dict.cancelBtn}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Native Floating Local Notice Card */}
      <AnimatePresence>
        {localToast && (
          <div className="fixed bottom-24 left-4 right-4 z-50 flex justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 text-white text-[11px] px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 max-w-sm pointer-events-auto leading-relaxed font-bold font-sans"
            >
              <div className="w-4 h-4 rounded-full bg-[#4FC3F7]/20 flex items-center justify-center text-[#4FC3F7] shrink-0 font-black">
                ✓
              </div>
              <span>{localToast}</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 1. Applicant Profile Preview Modal */}
      <AnimatePresence>
        {selectedApplicantData && (
          <div className="fixed inset-0 bg-[#1F2A44]/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl border border-gray-150 relative text-[#1F2A44]"
            >
              <button 
                onClick={() => setSelectedApplicantData(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div 
                onClick={() => {
                  if (onViewPublicProfile) {
                    onViewPublicProfile(selectedApplicantData.applicant.userId);
                    setSelectedApplicantData(null);
                  }
                }}
                className="mx-auto w-20 h-20 rounded-full overflow-hidden border-2 border-[#FFD34D] shadow-md bg-slate-50 flex items-center justify-center cursor-pointer hover:scale-105 transition-all"
              >
                <img src={selectedApplicantData.applicant.avatar} alt={selectedApplicantData.applicant.name} className="w-full h-full object-cover" />
              </div>

              <div className="space-y-1 font-sans">
                <h3 
                  onClick={() => {
                    if (onViewPublicProfile) {
                      onViewPublicProfile(selectedApplicantData.applicant.userId);
                      setSelectedApplicantData(null);
                    }
                  }}
                  className="font-extrabold text-[#FF3B7C] text-md cursor-pointer hover:underline transition-all"
                >
                  {selectedApplicantData.applicant.name}
                </h3>
                <div className="flex items-center justify-center gap-1 text-amber-500">
                  <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                  <span className="text-xs font-black font-mono">{selectedApplicantData.applicant.rating || '5.0'} / 5.0</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl flex items-center justify-around text-center">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">{lang === 'ar' ? 'العقود المكتملة' : 'Completed Quests'}</span>
                  <span className="text-sm font-black text-[#1F2A44] font-mono">{selectedApplicantData.applicant.questsCompleted || 0}</span>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">{lang === 'ar' ? 'الشرف والمستوى' : 'Level'}</span>
                  <span className="text-xs font-black text-rose-500 flex items-center gap-1">
                    <Award className="w-4.5 h-4.5" />
                    <span>Bronze</span>
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    const { quest, applicant } = selectedApplicantData;
                    onAcceptApplicant(quest.id, applicant.userId);
                    setSelectedApplicantData(null);
                  }}
                  className="w-full bg-[#FF3B7C] hover:bg-[#FF3B7C]/95 text-white font-extrabold text-xs py-3 rounded-xl transition-all shadow-md shadow-[#FF3B7C]/15 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Award className="w-4 h-4 text-white" />
                  <span className="text-white">{lang === 'ar' ? 'قبول العامل وتفعيل العقد 🤝' : 'Accept Worker and Activate Contract 🤝'}</span>
                </button>

                <button
                  disabled
                  title={lang === 'ar' ? 'تفتح المحادثة تلقائياً بمجرد قبولك وقفل العقد لحماية خصوصية الطرفين.' : 'Chat unlocks after contract activation.'}
                  className="w-full bg-slate-300 text-slate-500 font-extrabold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
                >
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>{lang === 'ar' ? 'الدردشة مغلقة (تفتح بعد التعيين) 🔒' : 'Chat Locked (Unlocks post-assignment) 🔒'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Interactive Messaging / Live Chat Window Modal */}
      <AnimatePresence>
        {activeChat && (
          <div className="fixed inset-0 bg-[#1F2A44]/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="relative bg-white rounded-3xl overflow-hidden max-w-xl md:max-w-2xl w-full h-[620px] md:h-[740px] max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 font-sans"
            >
              {/* Chat Header */}
              <div className="bg-[#1F2A44] p-4 text-white flex justify-between items-center relative border-b border-white/10 shrink-0">
                <div 
                  onClick={() => {
                    const parts = activeChat.chatId.split('_');
                    if (parts.length >= 3) {
                      const recipientId = currentUserId === parts[1] ? parts[2] : parts[1];
                      if (onViewPublicProfile) {
                        onViewPublicProfile(recipientId);
                        setActiveChat(null);
                      }
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer hover:opacity-90 group transition-all"
                  title={lang === 'ar' ? 'عرض الملف الشخصي العام 👤' : 'View Public Profile 👤'}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-white/30 bg-slate-800 transition-transform group-hover:scale-105 shrink-0">
                    <img 
                      src={liveRecipient?.avatar || liveRecipient?.photoURL || activeChat.recipientAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'} 
                      alt={liveRecipient?.name || liveRecipient?.displayName || activeChat.recipientName} 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-sm leading-none text-white group-hover:underline truncate">
                      {liveRecipient?.name || liveRecipient?.displayName || activeChat.recipientName}
                    </h4>
                    {(() => {
                      const isCurrentUserOwnerInChat = currentUserId === activeChat.chatId.split('_')[1];
                      const activeChatRoleLabel = isCurrentUserOwnerInChat
                        ? (lang === 'ar' ? 'منفذ المهمة 🏃' : lang === 'fr' ? 'Captain 🏃' : 'Captain 🏃')
                        : (lang === 'ar' ? 'صاحب العمل 💼' : lang === 'fr' ? 'Client 💼' : 'Employer 💼');
                      const activeChatRoleColor = isCurrentUserOwnerInChat
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-[#FFD34D]/25 text-[#FFD34D] border-[#FFD34D]/35';
                      return (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] text-[#4FC3F7] font-bold truncate max-w-[150px] md:max-w-[200px]" title={`Quest: ${activeChat.questTitle}`}>
                            Quest: {activeChat.questTitle}
                          </span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0 leading-none ${activeChatRoleColor}`}>
                            {activeChatRoleLabel}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setActiveChat(null);
                  }}
                  className="text-gray-300 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10 active:scale-90"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Dynamic banner for Quest Details */}
              {(() => {
                const chatQuestId = activeChat.chatId.split('_')[0];
                const chatQuest = quests.find(q => q.id === chatQuestId);
                if (!chatQuest) return null;
                return (
                  <div className="bg-[#FFD34D]/10 border-b border-[#FFD34D]/25 px-5 py-2.5 flex items-center justify-between shrink-0">
                    <span className="text-xs font-black text-[#1F2A44] leading-tight">
                      {lang === 'ar' ? 'مراجعة شروط المهمة واللوازم الحية؟' : 'Need to verify quest gear and terms?'}
                    </span>
                    <button 
                      onClick={() => {
                        if (onViewQuestDetail) onViewQuestDetail(chatQuestId);
                      }}
                      className="bg-[#1F2A44] hover:bg-[#1E2E4E] text-[#FFD34D] text-[10px] font-black px-4 py-2 rounded-full transition-all flex items-center gap-2 active:scale-95 cursor-pointer leading-none"
                    >
                      📋 {lang === 'ar' ? 'عرض تفاصيل المهمة' : 'View Quest Details'}
                    </button>
                  </div>
                );
              })()}

              {/* Chat Messages List Container */}
              <div className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-4 flex flex-col">
                {loadingChatMessages ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-[#4FC3F7] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-2.5 h-2.5 bg-[#4FC3F7] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2.5 h-2.5 bg-[#4FC3F7] rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-xs text-slate-400 font-bold">
                      {lang === 'ar' ? 'جاري تحميل المحادثة...' : 'Loading conversation...'}
                    </span>
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                      <MessageSquare className="w-6 h-6 text-slate-300 animate-pulse" />
                    </div>
                    <span className="text-xs text-slate-400 font-bold leading-normal">
                      {lang === 'ar' ? 'أرسل أول رسالة للاتفاق على التفاصيل واللوازم!' : 'Say hello and align on the required gear!'}
                    </span>
                  </div>
                ) : (
                  chatMessages.map((msg, index) => {
                    const isMe = msg.senderId === currentUserId;
                    const isSys = msg.senderId === 'system';
                    if (isSys) {
                      return (
                        <div key={index} className="mx-auto w-full max-w-sm text-center py-2 px-3 bg-[#4FC3F7]/10 border border-[#4FC3F7]/25 rounded-2xl text-[10px] text-slate-700 font-bold leading-normal">
                          {msg.text}
                        </div>
                      );
                    }
                    return (
                      <div 
                        key={index} 
                        className={`flex flex-col max-w-[80%] ${isMe ? 'self-end bg-[#1F2A44] text-white rounded-2xl rounded-tr-none p-3.5 shadow-md shadow-[#1F2A44]/15' : 'self-start bg-white border border-gray-250 text-slate-800 rounded-2xl rounded-tl-none p-3.5 shadow-xs'}`}
                      >
                        <span className="text-[9px] opacity-75 font-black block mb-0.5">{msg.senderName}</span>
                        <p className="text-xs font-semibold leading-relaxed break-words">{msg.text}</p>
                        <span className="text-[8px] opacity-60 text-right mt-1 font-mono leading-none block">
                          {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                        </span>
                      </div>
                    );
                  })
                )}
                {/* Scroll Anchor */}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Dock */}
              <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3 shrink-0">
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'اكتب رسالة هنا... (مثال: لوازم)' : 'Type message... (e.g. equipment)'}
                  value={chatInputText}
                  onChange={(e) => setChatInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendChatMessage();
                  }}
                  className="flex-1 bg-slate-100 border border-slate-200 outline-none rounded-2xl px-4.5 py-3 text-xs font-semibold focus:border-[#1F2A44] transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSendChatMessage}
                  className="bg-[#1F2A44] hover:bg-[#1E2E4E] text-[#FFD34D] p-3 rounded-full transition-all active:scale-90 cursor-pointer shrink-0"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
