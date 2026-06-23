import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin, Shield, Zap, Award, MessageSquare, Navigation, CheckCircle2, Trash, Edit } from 'lucide-react';
import { Quest, UserProfile } from '../types';
import { formatArabicDate } from '../utils/dateFormatter';

interface UnifiedQuestCardProps {
  quest: Quest;
  userProfile: UserProfile;
  userLoc: { lat: number; lng: number };
  lang?: 'ar' | 'fr' | 'en';
  isModal?: boolean;
  onClose?: () => void;
  onBookQuest: (questId: string, bookingFee: number) => void;
  onStartNavigation: (quest: Quest) => void;
  onOpenChat: (params: {
    chatId: string;
    questTitle: string;
    recipientName: string;
    recipientAvatar: string;
  }) => void;
  onManageQuest?: (questId: string) => void;
  onViewPublicProfile?: (userId: string) => void;
  onExtendPendingQuest?: (questId: string) => void;
  onExtendActiveContract?: (questId: string) => void;
  showToast?: (msg: string) => void;
}

export default function UnifiedQuestCard({
  quest,
  userProfile,
  userLoc,
  lang = 'ar',
  isModal = false,
  onClose,
  onBookQuest,
  onStartNavigation,
  onOpenChat,
  onManageQuest,
  onViewPublicProfile,
  onExtendPendingQuest,
  onExtendActiveContract,
  showToast
}: UnifiedQuestCardProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSubmittingDesc, setIsSubmittingDesc] = useState(false);
  const [tempDescription, setTempDescription] = useState('');

  // 1. Calculate user distance in km
  const calculateDistanceKm = (qLat: number, qLng: number) => {
    const R = 6371; // Earth radius in km
    const dLat = ((qLat - userLoc.lat) * Math.PI) / 180;
    const dLng = ((qLng - userLoc.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLoc.lat * Math.PI) / 180) *
        Math.cos((qLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    return parseFloat(dist.toFixed(1));
  };

  const distance = calculateDistanceKm(quest.lat, quest.lng);
  const tokenAmount = Math.max(50, Math.round(quest.cashReward * 0.10));

  // Dynamic banner equipment items based on category
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
          lang === 'ar' ? 'حقيبة تسوق قماشية صديقة للبيئة ومتينة' : 'Durable eco-friendly grocery bags',
          lang === 'ar' ? 'قائمة الطلبات المكتوبة مسبقاً لمراجعة الأسعار دقيقة' : 'Detailed shopping items index'
        ];
      case 'تقنية':
        return [
          lang === 'ar' ? 'جهاز لابتوب مجهز بأدوات التطوير والتحديث' : 'Developer laptop with specialized setups',
          lang === 'ar' ? 'كابل شبكة RJ45 ومفاتيح تخزين USB' : 'RJ45 network ethernet cables & USB storage keys',
          lang === 'ar' ? 'جهاز فحص الإشارة أو كود التفعيل المتاح' : 'Testing utility signal diagnostic dongles'
        ];
      case 'رعاية أليفة':
        return [
          lang === 'ar' ? 'حزام قيادة متين وطوق مخصص للسلامة' : 'Durable leash & secure safety collar',
          lang === 'ar' ? 'أكياس تجميع المخلفات ومطهر يدين' : 'Waste disposal pouches & hand sanitizers',
          lang === 'ar' ? 'طعام حيوانات جاف ومكافآت تدريبية صغيرة' : 'Pet food treats for behavioral rewarding'
        ];
      default:
        return [
          lang === 'ar' ? 'أدوات مخصصة ومعدات مناسبة لطبيعة الكويست' : 'Specific utility tools optimized for this role',
          lang === 'ar' ? 'هاتف ذكي مفعل به نظام تحديد المواقع العالمي GPS' : 'Active GPS-enabled smartphone'
        ];
    }
  };

  // 2. State Machine Logic for Action Tray
  // Determine user state milestone
  const isCreator = quest.creatorId === userProfile.id;
  const isPendingApplicant = quest.applicants?.some(a => a.userId === userProfile.id);
  const isApprovedAndActive = (quest.helperId === userProfile.id || quest.assignedRunnerId === userProfile.id || quest.assignedRunnerIds?.includes(userProfile.id)) && quest.status !== 'completed';
  const isCompleted = quest.status === 'completed';

  let currentTrayState: 'A' | 'B' | 'C' | 'D' | 'E' | 'BUSY' = 'B';

  if (isCompleted) {
    currentTrayState = 'E';
  } else if (isApprovedAndActive) {
    currentTrayState = 'D';
  } else if (isPendingApplicant) {
    currentTrayState = 'C';
  } else if (userProfile.isAvailable === false && !isCreator) {
    currentTrayState = 'BUSY';
  } else if (distance > 50) {
    currentTrayState = 'A';
  } else {
    currentTrayState = 'B';
  }

  // Gather Images
  const galleryImages: string[] = [];
  if (quest.images && quest.images.length > 0) {
    galleryImages.push(...quest.images);
  } else if (quest.imageUrls && quest.imageUrls.length > 0) {
    galleryImages.push(...quest.imageUrls);
  } else if (quest.imageUrl) {
    galleryImages.push(quest.imageUrl);
  }

  // Image deletion handler
  const handleDeleteImage = async (imageToDelete: string) => {
    const isRtl = lang === 'ar';
    const confirmMsg = isRtl 
      ? 'هل أنت متأكد من رغبتك في إزالة هذه الصورة من المعرض؟' 
      : 'Are you sure you want to remove this image from the gallery?';
    if (!window.confirm(confirmMsg)) return;

    try {
      // Filter out this image
      const updatedImages = (quest.images || []).filter(img => img !== imageToDelete);
      const updatedImageUrls = (quest.imageUrls || []).filter(img => img !== imageToDelete);
      let updatedImageUrl = quest.imageUrl;
      if (quest.imageUrl === imageToDelete) {
        updatedImageUrl = updatedImages[0] || '';
      }

      // Update in Firestore
      const { doc: fDoc, updateDoc: fUpdateDoc } = await import('firebase/firestore');
      const { db: fDb } = await import('../utils/firebase');
      
      await fUpdateDoc(fDoc(fDb, 'quests', quest.id), {
        images: updatedImages,
        imageUrls: updatedImageUrls,
        imageUrl: updatedImageUrl
      });

      if (showToast) {
        showToast(isRtl ? '✅ تم حذف الصورة من المعرض بنجاح!' : '✅ Image deleted from gallery successfully!');
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      if (showToast) {
        showToast(isRtl ? '❌ فشل حذف الصورة' : '❌ Failed to delete image');
      }
    }
  };

  const renderDeleteOverlay = (imgUrl: string) => {
    if (!isCreator) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDeleteImage(imgUrl);
        }}
        className="absolute top-2.5 right-2.5 bg-red-600 hover:bg-red-750 text-white rounded-full p-2 shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-115 active:scale-90 z-20 cursor-pointer border-none"
        title={lang === 'ar' ? 'حذف هذه الصورة' : 'Delete this image'}
      >
        <Trash className="w-3.5 h-3.5" />
      </button>
    );
  };

  const cardContent = (
    <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative flex flex-col font-sans text-start border border-slate-100">
      
      {/* Upper Header Layout */}
      <div className="p-6 pb-4 relative flex flex-col items-start border-b border-gray-100 bg-linear-to-b from-gray-50/50 to-white">
        
        {/* Close Button rendering (active for modal layouts) */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 bg-slate-900 hover:bg-slate-800 text-white rounded-full p-2 w-9 h-9 shadow-lg flex items-center justify-center transition-all duration-200 active:scale-90 z-20 cursor-pointer text-base focus:outline-none"
            title={lang === 'ar' ? 'إغلاق نافذة التفاصيل' : 'Close Details'}
          >
            <X className="w-5 h-5 font-black shrink-0" />
          </button>
        )}

        <div className="flex flex-wrap gap-1.5 mb-2 pr-12 items-center">
          <span className="bg-[#1F2A44] text-[#FFD34D] text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
            {quest.category}
          </span>
          {quest.urgency === 'urgent' && (
            <span className="bg-[#FF3B7C] text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">
              {lang === 'ar' ? 'عاجل جداً 🔥' : 'Urgent 🔥'}
            </span>
          )}
          {quest.urgency === 'featured' && (
            <span className="bg-[#3B82F6] text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
              {lang === 'ar' ? 'مميز ⭐' : 'Featured ⭐'}
            </span>
          )}
          <span className="bg-slate-100 text-slate-800 text-[9px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            📍 {distance} {lang === 'ar' ? 'كم' : 'km'}
          </span>
          {quest.createdAt && (
            <span className="bg-slate-50 text-slate-500 border border-slate-200/60 text-[9px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
              <span>🕒</span>
              <span>
                {lang === 'ar' ? 'نُشرت: ' : lang === 'fr' ? 'Publiée: ' : 'Posted: '}
                {formatArabicDate(quest.createdAt, lang)}
              </span>
            </span>
          )}
        </div>

        <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug tracking-tight text-start mt-1 pr-10 w-full">
          {quest.title}
        </h3>

        {/* Dynamic Deadline & Expiration Warning System Banner */}
        {(() => {
          const nowMs = new Date().getTime();
          const createdAtMs = new Date(quest.createdAt).getTime();
          const pendingTimeLimit = 8 * 60 * 60 * 1000;
          const pendingTimeRemaining = pendingTimeLimit - (nowMs - createdAtMs);

          const assignedAtMs = quest.assignedAt ? new Date(quest.assignedAt).getTime() : createdAtMs;
          const activeTimeLimit = 24 * 60 * 60 * 1000;
          const activeTimeRemaining = activeTimeLimit - (nowMs - assignedAtMs);

          const formatTimeRemaining = (ms: number) => {
            if (ms <= 0) return lang === 'ar' ? 'منتهية الصلاحية ⚠️' : 'Expired ⚠️';
            const totalMinutes = Math.floor(ms / (60 * 1000));
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            if (hours > 0) {
              return lang === 'ar' ? `${hours} س و ${mins} د` : `${hours}h ${mins}m`;
            }
            return lang === 'ar' ? `${mins} د` : `${mins}m`;
          };

          if (quest.status === 'open') {
            const isNearExpiry = pendingTimeRemaining <= 1 * 60 * 60 * 1000; // 1 hour left
            return (
              <div className={`mt-2.5 px-3.5 py-2 w-full rounded-xl flex items-center justify-between border text-[11px] font-bold ${
                isNearExpiry 
                  ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse' 
                  : 'bg-amber-50 text-amber-700 border-amber-180'
              }`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">⏰</span>
                  <span>
                    {lang === 'ar' 
                      ? 'متبقي على تلبية النشر الفعالة:' 
                      : 'Time left for active post:'}
                  </span>
                </div>
                <span className="font-mono text-xs font-black bg-white/60 px-2 py-0.5 rounded-md border border-black/5">
                  {formatTimeRemaining(pendingTimeRemaining)}
                </span>
              </div>
            );
          } else if (quest.status === 'active' || quest.status === 'booked') {
            const isNearContractExpiry = activeTimeRemaining <= 4 * 60 * 60 * 1000; // 4 hours left
            return (
              <div className="w-full mt-2.5 space-y-2">
                <div className={`px-3.5 py-2 w-full rounded-xl flex items-center justify-between border text-[11px] font-bold ${
                  isNearContractExpiry 
                    ? 'bg-rose-50 text-[#FF3B7C] border-rose-250 animate-pulse' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-250'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🤝</span>
                    <span>
                      {lang === 'ar' 
                        ? 'الوقت المتبقي لإنهاء عقد العمل:' 
                        : 'Time left to complete contract:'}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black bg-[#1F2A44]/5 px-2 py-0.5 rounded-md border border-black/5">
                    {formatTimeRemaining(activeTimeRemaining)}
                  </span>
                </div>
                {quest.assignedAt && (
                  <div className="text-[10px] text-slate-500 font-bold flex items-center justify-start gap-1.5 pb-1 px-1">
                    <span>📅</span>
                    <span>
                      {lang === 'ar' ? 'بدأ العقد:' : lang === 'fr' ? 'Contrat démarré:' : 'Contract started:'} <strong className="text-slate-700">{formatArabicDate(quest.assignedAt, lang)}</strong>
                    </span>
                  </div>
                )}
              </div>
            );
          } else if (quest.status === 'cancelled_by_timeout') {
            return (
              <div className="mt-2.5 px-3.5 py-2 w-full rounded-xl flex items-center justify-between border text-[11px] font-bold bg-neutral-100 text-neutral-600 border-neutral-200">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🛑</span>
                  <span>
                    {lang === 'ar' 
                      ? 'ملغي تلقائياً لتجاوز المهلة (Timeout)' 
                      : 'Expired & Canceled due to deadline limit'}
                  </span>
                </div>
                <span className="font-mono bg-white px-2 py-0.5 rounded-md border">
                  {lang === 'ar' ? 'انتهت المهلة' : 'Timed Out'}
                </span>
              </div>
            );
          }
          return null;
        })()}

        {/* Creator Identity Label */}
        <div className="flex items-center gap-2 mt-2 w-full border-t border-slate-50 pt-2.5">
          <img src={quest.creatorAvatar} alt={quest.creatorName} className="w-6 h-6 rounded-full object-cover shrink-0" />
          <span className="text-[10px] text-slate-500 font-extrabold">
            {lang === 'ar' ? 'بواسطة:' : 'By:'} {quest.creatorName}
          </span>
        </div>

        <div className="flex justify-between items-center w-full mt-3 mb-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
            {lang === 'ar' ? 'تفاصيل ومعلومات المنشور 📝' : 'Post Details & Information 📝'}
          </span>
          {isCreator && (
            <button
              type="button"
              onClick={() => {
                setTempDescription(quest.description);
                setIsEditingDescription(true);
              }}
              className="flex items-center gap-1 text-[11px] font-black text-blue-650 hover:text-blue-700 bg-blue-50 hover:bg-blue-105 px-3 py-1.5 rounded-full transition-all active:scale-95 cursor-pointer border-none"
              title={lang === 'ar' ? 'تعديل الوصف' : 'Edit description'}
            >
              <Edit className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تعديل الوصف' : 'Edit Description'}</span>
            </button>
          )}
        </div>

        <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-semibold bg-slate-50 p-4 rounded-2xl border border-gray-150/65 whitespace-pre-line text-start w-full font-sans">
          {quest.description}
        </p>

        {/* Swipeable / Grid Images Section */}
        {galleryImages.length > 0 && (
          <div className="mt-4 w-full">
            {galleryImages.length === 1 && (
              <div 
                className="quest-image-grid grid-1" 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr', 
                  height: '220px', 
                  gap: '8px', 
                  width: '100%', 
                  borderRadius: '12px', 
                  overflow: 'hidden', 
                  marginBottom: '12px' 
                }}
              >
                <div className="w-full h-full cursor-pointer relative" onClick={() => setLightboxImage(galleryImages[0])}>
                  <img
                    src={galleryImages[0]}
                    alt="Quest detail cover"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    referrerPolicy="no-referrer"
                  />
                  {renderDeleteOverlay(galleryImages[0])}
                </div>
              </div>
            )}

            {galleryImages.length === 2 && (
              <div 
                className="quest-image-grid grid-2" 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  height: '180px', 
                  gap: '8px', 
                  width: '100%', 
                  borderRadius: '12px', 
                  overflow: 'hidden', 
                  marginBottom: '12px' 
                }}
              >
                {galleryImages.map((img, idx) => (
                  <div key={idx} className="w-full h-full cursor-pointer relative" onClick={() => setLightboxImage(img)}>
                    <img
                      src={img}
                      alt={`Quest detailed reference ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      referrerPolicy="no-referrer"
                    />
                    {renderDeleteOverlay(img)}
                  </div>
                ))}
              </div>
            )}

            {galleryImages.length >= 3 && (
              <div 
                className="quest-image-grid grid-3" 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '2fr 1fr', 
                  gridTemplateRows: '1fr 1fr', 
                  height: '220px', 
                  gap: '8px', 
                  width: '100%', 
                  borderRadius: '12px', 
                  overflow: 'hidden', 
                  marginBottom: '12px' 
                }}
              >
                {/* First major image spans 2 rows */}
                <div 
                  className="w-full h-full cursor-pointer relative" 
                  style={{ gridRow: 'span 2' }}
                  onClick={() => setLightboxImage(galleryImages[0])}
                >
                  <img
                    src={galleryImages[0]}
                    alt="Quest principal reference"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    referrerPolicy="no-referrer"
                  />
                  {renderDeleteOverlay(galleryImages[0])}
                </div>

                {/* Next thumbnails (up to 2 visible slots on the right) */}
                {galleryImages.slice(1, 3).map((img, idx) => {
                  const isLastThumbnail = idx === 1;
                  const extraCount = galleryImages.length - 3;
                  return (
                    <div key={idx} className="w-full h-full cursor-pointer relative" onClick={() => setLightboxImage(img)}>
                      <img
                        src={img}
                        alt={`Quest detailed secondary ${idx + 2}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        referrerPolicy="no-referrer"
                      />
                      {renderDeleteOverlay(img)}
                      {isLastThumbnail && extraCount > 0 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-black text-xs select-none">
                          +{extraCount}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Hired Profile Box if booked/assigned */}
        {(quest.status !== 'open' || !!quest.assignedRunnerId || !!quest.helperId) && (() => {
          const isOwner = userProfile.id === quest.creatorId;
          const runnerId = quest.helperId || quest.assignedRunnerId || '';
          
          let profileId = '';
          let profileName = '';
          let profileAvatar = '';
          let roleTitle = '';

          if (isOwner) {
            const workerApplicant = quest.applicants?.find(a => a.userId === runnerId);
            profileId = runnerId;
            profileName = workerApplicant?.name || quest.helperName || (lang === 'ar' ? 'العامل المعيَّن 🏃‍♂️' : 'Hired Assistant 🏃‍♂️');
            profileAvatar = workerApplicant?.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120';
            roleTitle = lang === 'ar' ? 'العامل الميداني المتعاقد معه 🛠️' : 'Contracted Field Agent 🛠️';
          } else {
            profileId = quest.creatorId;
            profileName = quest.creatorName || (lang === 'ar' ? 'صاحب العمل 💼' : 'Employer 💼');
            profileAvatar = quest.creatorAvatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120';
            roleTitle = lang === 'ar' ? 'صاحب العمل (صاحب الطلب) 💼' : 'Quest Employer 💼';
          }

          const handleClickProfile = () => {
            if (profileId) {
              if (onViewPublicProfile) {
                onViewPublicProfile(profileId);
              } else {
                window.dispatchEvent(new CustomEvent('view-public-profile', {
                  detail: { userId: profileId }
                }));
              }
            }
          };

          return (
            <div className="border-t border-gray-150 pt-4 text-start w-full">
              <h4 className="text-gray-400 font-bold text-[10px] uppercase mb-2 flex items-center gap-1.5 justify-start">
                <Shield className="w-3.5 h-3.5 text-[#FF3B7C] stroke-[3px]" />
                <span>{lang === 'ar' ? 'تفاصيل الطرف الآخر في العقد 🤝' : 'Contract Participant Profile 🤝'}</span>
              </h4>
              <div 
                onClick={handleClickProfile}
                className="flex items-center justify-between p-3.5 bg-slate-50 border border-gray-150 hover:bg-slate-100/70 rounded-2xl cursor-pointer transition-all active:scale-98"
                title={lang === 'ar' ? 'انقر لعرض الملف الشخصي العام 👤' : 'Click to view public profile 👤'}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 bg-white shrink-0">
                    <img 
                      src={profileAvatar} 
                      alt={profileName} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="text-start">
                    <span className="text-[9px] text-gray-400 font-extrabold block">
                      {roleTitle}
                    </span>
                    <span className="text-xs font-black text-[#1F2A44] hover:underline">
                      {profileName}
                    </span>
                  </div>
                </div>

                <div className="bg-[#1F2A44] px-2.5 py-1 rounded-xl text-center flex items-center gap-1 text-white">
                  <span className="text-[10px] font-bold">{lang === 'ar' ? 'عرض الحساب 👤' : 'Profile 👤'}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Location Landmark */}
        <div className="border-t border-gray-150 pt-4 text-start w-full">
          <h4 className="text-gray-400 font-bold text-[10px] uppercase mb-1">{lang === 'ar' ? 'الموقع الجغرافي للمهمة' : 'Chore Delivery Landmark Location'}</h4>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-gray-50 p-3 rounded-2xl border border-gray-150/50">
            <MapPin className="w-4 h-4 text-[#4FC3F7] shrink-0" />
            <span>{quest.location}</span>
          </div>
        </div>
      </div>

      {/* Rewards, Tokens and Bottom Action Card */}
      <div className="p-6 bg-[#1F2A44] border-t border-white/10 rounded-b-3xl">
        <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[9px] text-[#FFD34D] block font-black uppercase tracking-wider mb-1">
                💰 {lang === 'ar' ? 'العائد المالي النقدي الميداني' : 'Direct Cash Payout'}
              </span>
              <span className="text-xl sm:text-2xl font-black text-white font-mono flex items-baseline gap-1">
                {quest.cashReward} <span className="text-xs font-sans text-gray-300 font-semibold">{lang === 'ar' ? 'دينار جزائري (د.ج)' : 'DZD / DA'}</span>
              </span>
            </div>

            <div className="text-right">
              <span className="text-[9px] text-gray-300 block font-black uppercase tracking-wider mb-1">
                ⚡ {lang === 'ar' ? 'الرمز المطلوب لحجز' : 'Required Tokens'}
              </span>
              <span className="text-md sm:text-lg font-black text-[#FFD34D] font-mono flex items-center justify-end gap-1">
                ⚡ {tokenAmount} <span className="text-[10px] font-sans text-gray-300 font-bold">Tokens</span>
              </span>
            </div>
          </div>

          <div className="text-[9.5px] text-gray-300 font-semibold leading-relaxed border-t border-white/10 pt-2 text-start">
            ℹ️ {lang === 'ar'
              ? 'الدفع يتم يداً بيد نقداً مائة بالمائة أو عبر تطبيق بريدي موب (BaridiMob) فور التسليم الميداني. يتم استخدام الرموز المطلوبة فقط لحجز وتثبيت الكويست.'
              : 'Paid directly in cash or via BaridiMob transfer on completion. Required tokens are consumed only to book and secure the quest opportunity.'}
          </div>

          {/* Tray Action Container */}
          <div className="space-y-2.5 pt-1.5 w-full">
            
            {/* If Creator, show direct active management button to follow up applicants */}
            {isCreator && !isCompleted && (
              <div className="w-full space-y-2">
                <button
                  onClick={() => {
                    if (onManageQuest) {
                      onManageQuest(quest.id);
                    } else {
                      const event = new CustomEvent('manage-quest', { detail: { questId: quest.id } });
                      window.dispatchEvent(event);
                    }
                    if (onClose) onClose();
                  }}
                  className="w-full bg-[#FF3B7C] hover:bg-[#FF3B7C]/95 text-white py-3.5 rounded-2xl font-black text-xs shadow-lg shadow-[#FF3B7C]/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 text-center"
                >
                  <span>
                    {lang === 'ar'
                      ? 'إدارة هذا المنشور ومتابعة المتقدمين 📋'
                      : lang === 'fr'
                      ? 'Gérer cette annonce & suivre les candidats 📋'
                      : 'Manage this post & follow up on applicants 📋'}
                  </span>
                </button>

                {/* Rule 1: Extension Button for Creator (Pending Quest hit 7th hour) */}
                {quest.status === 'open' && (() => {
                  const nowMs = new Date().getTime();
                  const createdAtMs = new Date(quest.createdAt).getTime();
                  const pendingTimeLimit = 8 * 60 * 60 * 1000;
                  const pendingTimeRemaining = pendingTimeLimit - (nowMs - createdAtMs);
                  if (pendingTimeRemaining <= 1 * 60 * 60 * 1000) {
                    return (
                      <button
                        onClick={() => {
                          if (onExtendPendingQuest) onExtendPendingQuest(quest.id);
                        }}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 py-3.5 rounded-2xl font-black text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 text-center leading-none border border-amber-605"
                      >
                        <span>
                          {lang === 'ar' 
                            ? '⏰ تمديد صلاحية النشر (8 ساعات إضافية)' 
                            : '⏰ Extend Post Validity (8 Additional Hours)'}
                        </span>
                      </button>
                    );
                  }
                  return null;
                })()}

                {/* Rule 2: Mutual Extension Requests for Creator when active card hits 20th hour (4 hours remain) */}
                {(quest.status === 'active' || quest.status === 'booked') && (() => {
                  const nowMs = new Date().getTime();
                  const assignedAtMs = quest.assignedAt ? new Date(quest.assignedAt).getTime() : new Date(quest.createdAt).getTime();
                  const activeTimeLimit = 24 * 60 * 60 * 1000;
                  const activeTimeRemaining = activeTimeLimit - (nowMs - assignedAtMs);

                  if (activeTimeRemaining <= 4 * 60 * 60 * 1000) {
                    const hasRequested = quest.extensionRequestedBy;
                    const isMyRequest = hasRequested === userProfile.id;
                    const isPendingApprovalFromMe = hasRequested && hasRequested !== userProfile.id;

                    if (isMyRequest) {
                      return (
                        <div className="w-full bg-slate-50 border border-slate-200 text-slate-500 py-3 rounded-2xl font-black text-xs text-center">
                          {lang === 'ar' ? '⏳ في انتظار موافقة الطرف الآخر على التمديد...' : '⏳ Awaiting secondary party approval...'}
                        </div>
                      );
                    } else if (isPendingApprovalFromMe) {
                      return (
                        <button
                          onClick={() => {
                            if (onExtendActiveContract) onExtendActiveContract(quest.id);
                          }}
                          className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-3.5 rounded-2xl font-black text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 text-center border border-emerald-600"
                        >
                          <span>
                            {lang === 'ar' 
                              ? '🤝 موافقة على طلب تمديد عقد العمل (24 ساعة إضافية)' 
                              : '🤝 Approve Contract Extension (24h Extra)'}
                          </span>
                        </button>
                      );
                    } else {
                      return (
                        <button
                          onClick={() => {
                            if (onExtendActiveContract) onExtendActiveContract(quest.id);
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-2xl font-black text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 text-center border border-blue-700"
                        >
                          <span>
                            {lang === 'ar'
                              ? '🤝 طلب تمديد عقد العمل (24 ساعة إضافية)'
                              : '🤝 Request Contract Extension (24h Extra)'}
                          </span>
                        </button>
                      );
                    }
                  }
                  return null;
                })()}
              </div>
            )}

            {!isCreator && (
              <>
                {/* STATE A: Out of Range */}
                {currentTrayState === 'A' && (
                  <button
                    disabled
                    className="w-full bg-white/10 border border-white/5 text-gray-400 py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center p-2.5 gap-2 cursor-not-allowed opacity-75"
                  >
                    <MapPin className="w-4.5 h-4.5 text-gray-400" />
                    <span className="text-center text-[10px] sm:text-xs">
                      {lang === 'ar' ? 'هذه المهمة خارج نطاقك الجغرافي المتاح للحجز 📍' : 'This quest is outside your available geographical booking limit 📍'}
                    </span>
                  </button>
                )}

                {/* STATE B: Local Booking Available */}
                {currentTrayState === 'B' && (
                  <div className="space-y-2 w-full text-right">
                    <p className="text-[10px] text-gray-400 font-extrabold bg-gray-50 p-2.5 border border-gray-150 rounded-2xl leading-relaxed">
                      {lang === 'ar'
                        ? '💡 يتضمن هذا العقد «رسوم التحقق والضمان وحماية المنصة» بنسبة 10% لضمان التزام معايير متجر Google Play لمنع الاحتيال.'
                        : '💡 This contract includes a 10% «Platform verification and guarantee protection fee» to align with safety standards.'}
                    </p>
                    <button
                      onClick={() => onBookQuest(quest.id, tokenAmount)}
                      className="w-full bg-[#FF3B7C] hover:bg-[#FF3B7C]/95 text-white py-3.5 rounded-2xl font-black text-xs shadow-lg shadow-[#FF3B7C]/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 text-center"
                    >
                      <Zap className="w-4.5 h-4.5 text-amber-300" />
                      <span>
                        {lang === 'ar'
                          ? `احجز المهمة الآن: يخصم ${tokenAmount} رمز ⚡`
                          : `Book Quest Now: Deduct ${tokenAmount} Tokens ⚡`}
                      </span>
                    </button>
                  </div>
                )}

                {/* STATE C: Pending Selection */}
                {currentTrayState === 'C' && (
                  <button
                    disabled
                    className="w-full bg-white/10 text-gray-300 py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center p-2.5 gap-2"
                  >
                    <span className="text-center">
                      {lang === 'ar'
                        ? 'تم تقديم طلبك بنجاح.. في انتظار اختيار صاحب العمل ⏳'
                        : 'Application pending.. Awaiting creator selection ⏳'}
                    </span>
                  </button>
                )}

                {/* STATE D: Approved & Active Contract */}
                {currentTrayState === 'D' && (
                  <div className="w-full space-y-2">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button
                        onClick={() => onStartNavigation(quest)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 text-center shadow-lg"
                      >
                        <Navigation className="w-4 h-4 text-white shrink-0" />
                        <span>{lang === 'ar' ? 'إلى التوجيه للوقع 🛰️' : 'Navigate 🛰️'}</span>
                      </button>
                      <button
                        onClick={() => {
                          if (onClose) onClose();
                          onOpenChat({
                            chatId: `${quest.id}_${quest.creatorId}_${userProfile.id}`,
                            questTitle: quest.title,
                            recipientName: quest.creatorName,
                            recipientAvatar: quest.creatorAvatar
                          });
                        }}
                        className="bg-[#FFD34D] hover:bg-[#FFE082] text-[#1F2A44] font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 text-center shadow-lg"
                      >
                        <MessageSquare className="w-4 h-4 shrink-0 text-[#1F2A44]" />
                        <span>{lang === 'ar' ? 'مراسلة 💬' : 'Chat 💬'}</span>
                      </button>
                    </div>

                    {/* Rule 2 Mutual Extension Requests for Runner when active card hits 20th hour (4 hours remain) */}
                    {(quest.status === 'active' || quest.status === 'booked') && (() => {
                      const nowMs = new Date().getTime();
                      const assignedAtMs = quest.assignedAt ? new Date(quest.assignedAt).getTime() : new Date(quest.createdAt).getTime();
                      const activeTimeLimit = 24 * 60 * 60 * 1000;
                      const activeTimeRemaining = activeTimeLimit - (nowMs - assignedAtMs);

                      if (activeTimeRemaining <= 4 * 60 * 60 * 1000) {
                        const hasRequested = quest.extensionRequestedBy;
                        const isMyRequest = hasRequested === userProfile.id;
                        const isPendingApprovalFromMe = hasRequested && hasRequested !== userProfile.id;

                        if (isMyRequest) {
                          return (
                            <div className="w-full bg-slate-50 border border-slate-200 text-slate-500 py-3.5 rounded-2xl font-black text-xs text-center border-dashed">
                              {lang === 'ar' ? '⏳ في انتظار موافقة الطرف الآخر على التمديد...' : '⏳ Awaiting secondary party approval...'}
                            </div>
                          );
                        } else if (isPendingApprovalFromMe) {
                          return (
                            <button
                              onClick={() => {
                                if (onExtendActiveContract) onExtendActiveContract(quest.id);
                              }}
                              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-3.5 rounded-2xl font-black text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 text-center border border-emerald-600"
                            >
                              <span>
                                {lang === 'ar' 
                                  ? '🤝 موافقة على طلب تمديد عقد العمل (24 ساعة إضافية)' 
                                  : '🤝 Approve Contract Extension (24h Extra)'}
                              </span>
                            </button>
                          );
                        } else {
                          return (
                            <button
                              onClick={() => {
                                if (onExtendActiveContract) onExtendActiveContract(quest.id);
                              }}
                              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-2xl font-black text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 text-center border border-blue-700"
                            >
                              <span>
                                {lang === 'ar'
                                  ? '🤝 طلب تمديد عقد العمل (24 ساعة إضافية)'
                                  : '🤝 Request Contract Extension (24h Extra)'}
                              </span>
                            </button>
                          );
                        }
                      }
                      return null;
                    })()}
                  </div>
                )}
              </>
            )}

            {/* STATE E: Completed & Historical Souvenir */}
            {currentTrayState === 'E' && (
              <div className="bg-emerald-550/10 border border-emerald-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-1">
                <div className="flex items-center gap-1.5 text-emerald-450 font-black text-xs sm:text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>{lang === 'ar' ? 'كذكرى في البورتفوليو 🎉' : 'Completed Portfolio Milestone 🎉'}</span>
                </div>
                <p className="text-[10px] text-slate-300 font-bold max-w-xs mt-1">
                  {lang === 'ar'
                    ? 'تم إنجاز هذه المهمة بنجاح وتوثيق فخرها وإحصائياتها بمحفظة أعمالك!'
                    : 'This task was successfully executed & logged into your local service career profile archives!'}
                </p>
              </div>
            )}

            {/* STATE BUSY: Already assigned and unavailable */}
            {currentTrayState === 'BUSY' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-1 w-full">
                <div className="flex items-center gap-1.5 text-amber-500 font-black text-xs sm:text-sm">
                  <Shield className="w-5 h-5 text-amber-500 shrink-0" />
                  <span>{lang === 'ar' ? 'لديك مهمة نشطة حالياً ⚠️' : 'You have an active quest assignment ⚠️'}</span>
                </div>
                <p className="text-[10px] text-amber-600/90 font-bold max-w-xs mt-1">
                  {lang === 'ar'
                    ? 'لا يمكنك الحجز أو التقديم على مهام أخرى حتى تنتهي من إنجاز مهمتك الشاغرة الحالية!'
                    : 'You cannot book or apply for other quests until your current pending offline assignment is completed!'}
                </p>
              </div>
            )}

            {/* Bottom cancel or close action */}
            {onClose && (
              <button
                onClick={onClose}
                className="w-full bg-white/5 text-gray-350 hover:bg-white/10 hover:text-white py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center mt-1"
              >
                {lang === 'ar' ? 'الرجوع للخلف' : 'Go Back'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Overlay */}
      {lightboxImage && (
        <div className="fixed inset-0 bg-black/95 z-55 flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
          <button className="absolute top-5 right-5 text-white/80 hover:text-white text-3xl font-bold cursor-pointer">&times;</button>
          <img src={lightboxImage} alt="Fullscreen Reference Preview" className="max-w-full max-h-full object-contain rounded-lg" referrerPolicy="no-referrer" />
        </div>
      )}

      {/* Edit Description Dialog */}
      <AnimatePresence>
        {isEditingDescription && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-55">
            {/* Backdrop click to abandon */}
            <div className="absolute inset-0" onClick={() => {
              if (!isSubmittingDesc) {
                setIsEditingDescription(false);
                setTempDescription('');
              }
            }}></div>

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="relative bg-white rounded-3xl w-full max-w-md p-6 border border-slate-100 shadow-2xl space-y-4 text-start font-sans z-10"
              style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}
            >
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <h4 className="font-extrabold text-sm text-[#1F2A44] flex items-center gap-1.5">
                  <span>📝</span>
                  <span>{lang === 'ar' ? 'تعديل وصف المنشور' : 'Edit Post Description'}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingDescription(false);
                    setTempDescription('');
                  }}
                  className="p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer border-none"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-3 text-start">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  {lang === 'ar' ? 'الوصف الجديد للمهمة' : 'New Quest Description'}
                </label>
                <textarea
                  value={tempDescription}
                  onChange={(e) => setTempDescription(e.target.value)}
                  rows={6}
                  maxLength={2000}
                  placeholder={lang === 'ar' ? 'أدخل تفاصيل المهمة الدقيقة هنا...' : 'Describe your quest details...'}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-[#1F2A44] transition-all resize-none text-start"
                />
                <div className="text-right text-[10px] text-gray-400 font-bold font-mono">
                  {tempDescription.length}/2000
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingDesc}
                  onClick={async () => {
                    if (!tempDescription.trim()) {
                      if (showToast) {
                        showToast(lang === 'ar' ? '⚠️ لا يمكن حفظ وصف فارغ' : '⚠️ Description cannot be empty');
                      }
                      return;
                    }
                    setIsSubmittingDesc(true);
                    try {
                      const { doc: fDoc, updateDoc: fUpdateDoc } = await import('firebase/firestore');
                      const { db: fDb } = await import('../utils/firebase');
                      
                      await fUpdateDoc(fDoc(fDb, 'quests', quest.id), {
                        description: tempDescription.trim()
                      });

                      if (showToast) {
                        showToast(lang === 'ar' ? '✅ تم تحديث وصف المنشور بنجاح!' : '✅ Post description updated successfully!');
                      }
                      setIsEditingDescription(false);
                    } catch (err: any) {
                      console.error("Description update error:", err);
                      if (showToast) {
                        showToast(lang === 'ar' ? '❌ فشل تحديث الوصف' : '❌ Failed to update description');
                      }
                    } finally {
                      setIsSubmittingDesc(false);
                    }
                  }}
                  className="flex-1 bg-[#1F2A44] hover:bg-[#151E33] text-white font-black text-xs py-3 rounded-xl transition-all shadow-md cursor-pointer text-center disabled:opacity-50"
                >
                  {isSubmittingDesc
                    ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                    : (lang === 'ar' ? 'حفظ التعديلات 💾' : 'Save Changes 💾')}
                </button>
                <button
                  type="button"
                  disabled={isSubmittingDesc}
                  onClick={() => {
                    setIsEditingDescription(false);
                    setTempDescription('');
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-[#1F2A44] font-black text-xs px-4 py-3 rounded-xl transition-all cursor-pointer border-none"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );

  // If designated as modal, wrap in overlay backdrop with entry fade + scale spring physics
  if (isModal) {
    return (
      <div className="fixed inset-0 bg-[#0F172A]/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
        {/* Click background backdrop to escape modal */}
        <div className="absolute inset-0" onClick={onClose}></div>
        
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 15 }}
          transition={{ type: 'spring', damping: 24, stiffness: 220 }}
          className="relative max-w-lg w-full z-10"
        >
          {cardContent}
        </motion.div>
      </div>
    );
  }

  // Standalone rendering
  return cardContent;
}
