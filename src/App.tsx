/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  INITIAL_USER_PROFILE, 
  INITIAL_QUESTS, 
  INITIAL_LEADERS, 
  INITIAL_CHALLENGES, 
  INITIAL_BADGES,
  INITIAL_HUNTER_REVIEWS,
  INITIAL_GODFATHER_REVIEWS
} from './data/mockData';
import { Quest, UserProfile, UserModel, Leader, Challenge, Badge, ViewState, HunterReview, GodfatherReview } from './types';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { onSnapshot, doc, setDoc, updateDoc, deleteDoc, collection, getDoc, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, cleanData } from './utils/firebase';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import Navbar from './components/Navbar';
import QuestLogo from './components/QuestLogo';
import HomeView from './components/HomeView';
import MapView from './components/MapView';
import LeaderboardView from './components/LeaderboardView';
import MyQuestsView from './components/MyQuestsView';
import ProfileView from './components/ProfileView';
import AdminView from './components/AdminView';
import PublicProfileView from './components/PublicProfileView';
import ReciprocalRatingModal from './components/ReciprocalRatingModal';
import NotificationScreen, { NotificationDoc } from './components/NotificationScreen';
import InboxScreen from './components/InboxScreen';
import UnifiedQuestCard from './components/UnifiedQuestCard';
import QuestDetailScreen from './components/QuestDetailScreen';
import { motion, AnimatePresence } from 'motion/react';
import { Geolocator } from './utils/geolocator';
import AuthScreen from './components/AuthScreen';

const generateShortId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'QST-';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [navigatingQuest, setNavigatingQuest] = useState<Quest | null>(null);
  
  // State variables synchronized with localStorage
  const [quests, setQuests] = useState<Quest[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [hunterReviews, setHunterReviews] = useState<HunterReview[]>([]);
  const [godfatherReviews, setGodfatherReviews] = useState<GodfatherReview[]>([]);
  const [activeRatingQuestId, setActiveRatingQuestId] = useState<string | null>(null);
  const [isLoadingRating, setIsLoadingRating] = useState<boolean>(true);
  const [loadedQuests, setLoadedQuests] = useState<boolean>(false);
  const [loadedHunterReviews, setLoadedHunterReviews] = useState<boolean>(false);
  const [loadedGodfatherReviews, setLoadedGodfatherReviews] = useState<boolean>(false);
  const [selectedPublicProfileId, setSelectedPublicProfileId] = useState<string | null>(null);
  const [deferredActiveChat, setDeferredActiveChat] = useState<any>(null);
  const [userFlags, setUserFlags] = useState<Record<string, number>>({});
  const [authenticatedUser, setAuthenticatedUser] = useState<any>(null);
  const [authInitialized, setAuthInitialized] = useState<boolean>(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState<boolean>(false);
  const [splashActive, setSplashActive] = useState<boolean>(true);
  const [splashFadeOut, setSplashFadeOut] = useState<boolean>(false);
  const [animationPhase, setAnimationPhase] = useState<'zoom' | 'shrink' | 'text-fade'>('zoom');

  // Real-time Captain arrival alert state for employers
  const [activeArrivalAlert, setActiveArrivalAlert] = useState<{ id: string; text: string; questId?: string } | null>(null);
  const alertedArrivalIdsRef = React.useRef<Set<string>>(new Set());
  
  // State variables for GPS Permission Guardrails
  const [isGpsEnabled, setIsGpsEnabled] = useState<boolean>(true);
  const [gpsAlertOpen, setGpsAlertOpen] = useState<boolean>(false);

  // Pre-flight balance check and KYC prompt state
  const [showKycRefillPromptModal, setShowKycRefillPromptModal] = useState<boolean>(false);
  const [requiredRefillFee, setRequiredRefillFee] = useState<number>(0);

  // Centralized hardware-level GPS verification state & prompts
  const [showGpsExplainDialog, setShowGpsExplainDialog] = useState<boolean>(false);
  const [explainReason, setExplainReason] = useState<'publish' | 'book' | null>(null);
  const [pendingGpsParams, setPendingGpsParams] = useState<any>(null);
  const [gpsSecurityError, setGpsSecurityError] = useState<string | null>(null);
  
  // Real-time backend notifications and chats state variables
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [userChats, setUserChats] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [initialSelectedQuestId, setInitialSelectedQuestId] = useState<string | null>(null);
  const [myQuestsActiveTab, setMyQuestsActiveTab] = useState<'obligations' | 'created' | null>(null);
  const [autoOpenCreateQuest, setAutoOpenCreateQuest] = useState<boolean>(false);
  const [globalQuestDetailId, setGlobalQuestDetailId] = useState<string | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<{ view: ViewState; questDetailId: string | null; selectedPublicProfileId: string | null }[]>([]);

  // Synchronize Dark Mode Class (stored in userProfile.privacyEnabled)
  useEffect(() => {
    if (userProfile?.privacyEnabled) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [userProfile?.privacyEnabled]);

  // Register Capacitor Push Notifications and define FCM listener handlers
  useEffect(() => {
    if (!userProfile?.id) return;

    const initPushNotifications = async () => {
      if (!Capacitor.isNativePlatform()) {
        console.log('FCM Push notifications: Running on Web Environment. Native listeners are bypassed (Simulation logging active).');
        return;
      }

      try {
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.warn('Capacitor Push Notifications: Device permissions were denied.');
          return;
        }

        // Register with Google FCM / Apple APNS channels
        await PushNotifications.register();

        // On successful registration, update user profile document in Firestore
        PushNotifications.addListener('registration', async (token) => {
          console.log('Mobile Push registration succeeded. Captured FCM Token:', token.value);
          try {
            const userRef = doc(db, 'users', userProfile.id);
            await updateDoc(userRef, { fcmToken: token.value });
          } catch (err) {
            console.error('Failed to update fcmToken inside Firestore user doc:', err);
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration fail: ' + JSON.stringify(error));
        });

        // Capture incoming push alert events when app is active (Foreground)
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push notification received in foreground:', notification);
          if (notification.title || notification.body) {
            showToast(`🔔 ${notification.title}: ${notification.body}`);
          }
        });

        // Capture incoming action push alerts when background / completely closed (Background)
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('Push notification selection occurred:', notification);
          const data = notification.notification.data;
          if (data && data.questId) {
            navigateToQuestDetail(data.questId);
          }
        });

      } catch (err) {
        console.error('Error during Capacitor push registrations:', err);
      }
    };

    initPushNotifications();
  }, [userProfile?.id]);

  // Unified helper to dispatch mobile notifications
  const sendPushNotification = async (recipientId: string, title: string, body: string, data?: Record<string, string>) => {
    console.log(`[FCM Notification Dispatch Request] Send to ${recipientId}`, { title, body, data });
    
    // Simulate push alert inside app UI if recipient is the current active user
    if (userProfile && recipientId === userProfile.id) {
      showToast(`🔔 ${title}: ${body}`);
    }

    try {
      const recipientDoc = await getDoc(doc(db, 'users', recipientId));
      if (recipientDoc.exists()) {
        const uDoc = recipientDoc.data();
        const token = uDoc?.fcmToken;
        if (token) {
          console.log(`FCM Token detected for reader: ${token}. Invoking server dispatch proxy.`);
          await fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, title, body, data })
          });
        }
      }
    } catch (err) {
      console.warn("FCM dynamic API dispatch rejected or offline:", err);
    }
  };

  const navigateToQuestDetail = (questId: string) => {
    setNavigationHistory(prev => [
      ...prev,
      { view: currentView, questDetailId: globalQuestDetailId, selectedPublicProfileId }
    ]);
    setGlobalQuestDetailId(questId);
    setSelectedPublicProfileId(null);
  };

  const navigateBack = () => {
    if (navigationHistory.length > 0) {
      const previous = navigationHistory[navigationHistory.length - 1];
      setNavigationHistory(prev => prev.slice(0, -1));
      setCurrentView(previous.view);
      setGlobalQuestDetailId(previous.questDetailId);
      setSelectedPublicProfileId(previous.selectedPublicProfileId);
    } else {
      setGlobalQuestDetailId(null);
    }
  };

  const handleViewNavigation = async (view: ViewState) => {
    // Rule 1: Allow seamless browsing and map navigation without launch/modal GPS gates
    setCurrentView(view);
    setSelectedPublicProfileId(null);
    setGlobalQuestDetailId(null);
  };
  
  // Real-time hardware GPS level tracking coordinates
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number }>({ lat: 36.7538, lng: 3.0588 });

  // Quest Cleanup, Expiration & Extension System task loop
  useEffect(() => {
    const PENDING_QUEST_TIMEOUT = 8 * 60 * 60 * 1000; // 8 Hours
    const ACTIVE_CONTRACT_TIMEOUT = 24 * 60 * 60 * 1000; // 24 Hours

    const intervalId = setInterval(async () => {
      if (!quests || quests.length === 0) return;

      const now = new Date().getTime();
      let hasChanges = false;
      const updatedList = [...quests];

      for (let i = 0; i < updatedList.length; i++) {
        const quest = updatedList[i];

        // Case 1: Pending/Open Quest 8-Hour limit
        if (quest.status === 'open') {
          const createdAtTime = new Date(quest.createdAt).getTime();
          if (now - createdAtTime >= PENDING_QUEST_TIMEOUT) {
            console.log(`Quest ${quest.id} has expired.`);
            
            // Delete from Firestore
            if (auth.currentUser) {
              try {
                await deleteDoc(doc(db, 'quests', quest.id));
              } catch (err) {
                console.error(`Failed to auto-delete expired quest ${quest.id}:`, err);
              }
            }

            // Remove from creator list if creator is the current active user, without token refund
            if (userProfile && quest.creatorId === userProfile.id) {
              if (auth.currentUser) {
                try {
                  await setDoc(doc(db, 'users', auth.currentUser.uid), {
                    tokenBalance: userProfile.tokenBalance,
                    tokens: (userProfile as any).tokens || userProfile.tokenBalance
                  }, { merge: true });
                } catch (e) {
                  console.warn("Could not sync profile expiration DB:", e);
                }
              }

              // Update client profile state (safely decrement count and clear from created lists)
              syncProfile({
                ...userProfile,
                questsCreated: Math.max(0, userProfile.questsCreated - 1),
                createdQuestsIds: userProfile.createdQuestsIds.filter(id => id !== quest.id),
                tokenBalance: userProfile.tokenBalance,
                tokens: (userProfile as any).tokens || userProfile.tokenBalance
              } as any);

              showToast(
                userProfile.language === 'ar'
                  ? `⏰ انتهت صلاحية نشر مهمة "${quest.title}" (8 ساعات). تم سحب المنشور تلقائياً!`
                  : `⏰ Your quest "${quest.title}" has expired (8h deadline). The post has been automatically withdrawn!`
              );
            }
          }
        }

        // Case 2: Active Contract 24-Hour limit
        if (quest.status === 'active' || quest.status === 'booked') {
          const assignTime = quest.assignedAt ? new Date(quest.assignedAt).getTime() : new Date(quest.createdAt).getTime();
          if (now - assignTime >= ACTIVE_CONTRACT_TIMEOUT) {
            console.log(`Contract ${quest.id} has timed out.`);
            
            // Unblock worker availability
            const assignedRunners = quest.assignedRunnerIds && quest.assignedRunnerIds.length > 0
              ? quest.assignedRunnerIds
              : [quest.helperId || quest.assignedRunnerId].filter(Boolean) as string[];

            assignedRunners.forEach(async (runnerId) => {
              if (auth.currentUser) {
                try {
                  await setDoc(doc(db, 'users', runnerId), { isAvailable: true }, { merge: true });
                } catch (err) {
                  console.warn(`Could not reset runner ${runnerId} availability:`, err);
                }
              }
              if (userProfile && runnerId === userProfile.id) {
                syncProfile({
                  ...userProfile,
                  isAvailable: true
                });
              }
            });

            // Update quest status
            const updatedQuest: Quest = {
              ...quest,
              status: 'cancelled_by_timeout'
            };

            if (auth.currentUser) {
              try {
                await setDoc(doc(db, 'quests', quest.id), cleanData(updatedQuest));
              } catch (e) {
                console.error(`Failed to update quest ${quest.id} status to timeout cancelled:`, e);
              }
            } else {
              updatedList[i] = updatedQuest;
              hasChanges = true;
            }

            if (userProfile && (quest.creatorId === userProfile.id || assignedRunners.includes(userProfile.id))) {
              showToast(
                userProfile.language === 'ar'
                  ? `⏰ تم إلغاء عقد العمل لمهمة "${quest.title}" تلقائياً لتجاوز الموعد النهائي (24 ساعة).`
                  : `⏰ Contract for "${quest.title}" canceled automatically due to timeout (24 hours deadline).`
              );
            }
          }
        }
      }

      if (hasChanges && !auth.currentUser) {
        setQuests(updatedList);
        localStorage.setItem('quest_app_quests', JSON.stringify(updatedList));
      }
    }, 10000);

    return () => clearInterval(intervalId);
  }, [quests, userProfile]);

  // Synchronically listen to Geolocator status shifts with low-level interval polling for real-time compliance
  useEffect(() => {
    const handleGpsSync = async () => {
      const enabled = await Geolocator.isLocationServiceEnabled();
      setIsGpsEnabled(enabled);
    };
    handleGpsSync();

    // Constant 1-second polling interval querying the database or mock system geolocation state provider
    const intervalId = setInterval(handleGpsSync, 1000);

    const handleGpsStatusEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setIsGpsEnabled(detail.enabled);
      }
    };
    window.addEventListener('gps_status_changed', handleGpsStatusEvent);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('gps_status_changed', handleGpsStatusEvent);
    };
  }, []);

  // Silent tracking of GPS coordinates on startup. Checks if permission is already granted.
  // Never prompt on startup! Fully complies with Rule 1.
  useEffect(() => {
    let watchId: number | null = null;
    const initSilentWatch = async () => {
      try {
        if (!navigator.geolocation) return;
        if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
          const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (perm.state === 'granted') {
            watchId = navigator.geolocation.watchPosition(
              (position) => {
                setUserLoc({ lat: position.coords.latitude, lng: position.coords.longitude });
              },
              (error) => {
                console.warn("App.tsx level silent gps check:", error);
              },
              {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
              }
            );
          }
        }
      } catch (err) {
        console.warn("Silent permissions check failure:", err);
      }
    };
    initSilentWatch();
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Simulation notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Custom Toast helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Admin: Broadcast platform messages and updates to all users via sticky bar!
  const [globalBroadcast, setGlobalBroadcast] = useState<string | null>(
    'مرحباً بك في كويست : المنصة الأولى لربط الشباب بفرص عمل ميدانية! '
  );

  // Google / Firebase Authentication functions
  const handleSignInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      showToast('🎉 تم تسجيل الدخول بنجاح عبر حساب Google!');
    } catch (e: any) {
      console.error('Google Sign In Error', e);
      showToast('⚠️ فشل تسجيل الدخول: ' + e.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast('ℹ️ تم تسجيل الخروج من حسابك السحابي.');
    } catch (e: any) {
      console.error('Sign Out Error', e);
    }
  };

  // 1. Initial State bootstrapping and Firebase Authentication/Firestore sync
  useEffect(() => {
    // A. Setup local storage caching fallback loaders
    try {
      const storedFlags = localStorage.getItem('quest_app_user_flags');
      if (storedFlags) setUserFlags(JSON.parse(storedFlags));

      const storedLeaders = localStorage.getItem('quest_app_leaders');
      if (storedLeaders) setLeaders(JSON.parse(storedLeaders));
      else {
        setLeaders(INITIAL_LEADERS);
        localStorage.setItem('quest_app_leaders', JSON.stringify(INITIAL_LEADERS));
      }

      const storedChallenges = localStorage.getItem('quest_app_challenges');
      if (storedChallenges) setChallenges(JSON.parse(storedChallenges));
      else {
        setChallenges(INITIAL_CHALLENGES);
        localStorage.setItem('quest_app_challenges', JSON.stringify(INITIAL_CHALLENGES));
      }

      const storedBadges = localStorage.getItem('quest_app_badges');
      if (storedBadges) setBadges(JSON.parse(storedBadges));
      else {
        setBadges(INITIAL_BADGES);
        localStorage.setItem('quest_app_badges', JSON.stringify(INITIAL_BADGES));
      }
    } catch (e) {
      console.error('Failed mock list loading from LocalStorage', e);
    }

    // B. Realtime Auth state and Firestore synchronization
    let unsubProfile: (() => void) | null = null;
    let unsubQuests: (() => void) | null = null;
    let unsubReviews: (() => void) | null = null;
    let unsubGodfatherReviews: (() => void) | null = null;
    let unsubNotifications: (() => void) | null = null;
    let unsubChatsOwner: (() => void) | null = null;
    let unsubChatsApplicant: (() => void) | null = null;
    let unsubUsers: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clear legacy listeners first to prevent memory/permissions leaks
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      if (unsubQuests) { unsubQuests(); unsubQuests = null; }
      if (unsubReviews) { unsubReviews(); unsubReviews = null; }
      if (unsubGodfatherReviews) { unsubGodfatherReviews(); unsubGodfatherReviews = null; }
      if (unsubNotifications) { unsubNotifications(); unsubNotifications = null; }
      if (unsubChatsOwner) { unsubChatsOwner(); unsubChatsOwner = null; }
      if (unsubChatsApplicant) { unsubChatsApplicant(); unsubChatsApplicant = null; }
      if (unsubUsers) { unsubUsers(); unsubUsers = null; }

      if (firebaseUser) {
        setAuthenticatedUser(firebaseUser);
        
        // Load cloud documents
        const userRef = doc(db, 'users', firebaseUser.uid);
        let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch (err) {
          console.error("Firestore access error on connect:", err);
        }

        let profileToUse: UserProfile;
        const normEmail = (firebaseUser.email || '').toLowerCase().trim();
        const matchesAdmin = normEmail === 'hakerzoldyck@gmail.com';

        if (userSnap && userSnap.exists()) {
          profileToUse = UserModel.fromFirestore(userSnap.data(), firebaseUser.uid);
          
          // Generate and backfill shortId if it is missing
          if (!profileToUse.shortId) {
            const generatedCode = generateShortId();
            profileToUse = {
              ...profileToUse,
              shortId: generatedCode
            };
            try {
              await updateDoc(userRef, { shortId: generatedCode });
            } catch (err) {
              console.error("Failed saving shortId to existing user profile:", err);
            }
          }

          // Dynamically sync and upgrade existing hakerzoldyck@gmail.com profiles in Firestore to secure role
          if (matchesAdmin && (profileToUse.role !== 'admin' || !profileToUse.isAdmin || profileToUse.email !== normEmail)) {
            profileToUse = {
              ...profileToUse,
              isAdmin: true,
              role: 'admin',
              email: normEmail
            };
            try {
              await updateDoc(userRef, {
                isAdmin: true,
                role: 'admin',
                email: normEmail
              });
            } catch (err) {
              console.error("Failed dynamics database promote to admin: ", err);
            }
          } else if (!profileToUse.email && firebaseUser.email) {
            profileToUse.email = normEmail;
            try {
              await updateDoc(userRef, { email: normEmail });
            } catch (err) {
              console.error("Failed saving email to profile: ", err);
            }
          }
        } else {
          profileToUse = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || 'صياد كويست',
            phone: firebaseUser.phoneNumber || '0555123456',
            city: 'الجزائر العاصمة (Algiers)',
            avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            questsCompleted: 0,
            questsCreated: 0,
            totalPoints: 0,
            tokenBalance: 300,
            rating: 5.0,
            level: 1,
            idVerificationStatus: 'unverified',
            kycRewardClaimed: false,
            completedQuestsIds: [],
            createdQuestsIds: [],
            unlockedBadgeIds: ['badge-welcome'],
            language: 'ar',
            enableNotifications: true,
            privacyEnabled: false,
            audioEffectsEnabled: true,
            hapticFeedbackEnabled: true,
            isAdmin: matchesAdmin,
            role: matchesAdmin ? 'admin' : 'user',
            email: normEmail,
            shortId: generateShortId(),
            bio: '',
          };
          try {
            await setDoc(userRef, cleanData(UserModel.toFirestore(profileToUse)));
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${firebaseUser.uid}`);
          }
        }

        setUserProfile(profileToUse);
        setAuthInitialized(true);

        // Sub 1: Profile listener
        unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(UserModel.fromFirestore(docSnap.data(), firebaseUser.uid));
          }
        }, (e) => handleFirestoreError(e, OperationType.GET, `users/${firebaseUser.uid}`));

        // Sub 2: Quests list listener
        unsubQuests = onSnapshot(collection(db, 'quests'), (snap) => {
          const loadedQuestsData: Quest[] = [];
          snap.forEach((docSnap) => {
            const id = docSnap.id;
            const data = docSnap.data();
            // Automatically purge legacy mock/trial quests from Firestore to keep DB pure
            if (id.startsWith('q-') && !id.startsWith('q-user-')) {
              deleteDoc(doc(db, 'quests', id)).catch(err => {
                console.warn(`Failed to legacy purge mock quest ${id}:`, err);
              });
            } else {
              loadedQuestsData.push({ ...data, id } as Quest);
            }
          });
          loadedQuestsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          setQuests(loadedQuestsData);
          setLoadedQuests(true);
        }, (e) => {
          handleFirestoreError(e, OperationType.LIST, 'quests');
          setLoadedQuests(true);
        });

        // Sub 3: Reviews list listener
        unsubReviews = onSnapshot(collection(db, 'reviews'), (snap) => {
          const loadedReviews: HunterReview[] = [];
          snap.forEach((doc) => {
            loadedReviews.push(doc.data() as HunterReview);
          });
          if (loadedReviews.length > 0) {
            setHunterReviews(loadedReviews);
          } else {
            // Seed reviews
            INITIAL_HUNTER_REVIEWS.forEach(async (initReview) => {
              try {
                await setDoc(doc(db, 'reviews', initReview.reviewId), cleanData(initReview));
              } catch (e) {
                console.error("Firestore review write seed error", e);
              }
            });
            setHunterReviews(INITIAL_HUNTER_REVIEWS);
          }
          setLoadedHunterReviews(true);
        }, (e) => {
          handleFirestoreError(e, OperationType.LIST, 'reviews');
          setLoadedHunterReviews(true);
        });

        // Sub 3b: Godfather reviews list listener
        unsubGodfatherReviews = onSnapshot(collection(db, 'godfather_reviews'), (snap) => {
          const loadedGReviews: GodfatherReview[] = [];
          snap.forEach((doc) => {
            loadedGReviews.push(doc.data() as GodfatherReview);
          });
          if (loadedGReviews.length > 0) {
            setGodfatherReviews(loadedGReviews);
          } else {
            INITIAL_GODFATHER_REVIEWS.forEach(async (initGReview) => {
              try {
                await setDoc(doc(db, 'godfather_reviews', initGReview.reviewId), cleanData(initGReview));
              } catch (e) {
                console.error("Firestore godfather review write seed error", e);
              }
            });
            setGodfatherReviews(INITIAL_GODFATHER_REVIEWS);
          }
          setLoadedGodfatherReviews(true);
        }, (e) => {
          handleFirestoreError(e, OperationType.LIST, 'godfather_reviews');
          setLoadedGodfatherReviews(true);
        });

        // Sub 4: Notifications collection subscription
        const qNotifications = query(collection(db, 'notifications'), where('userId', '==', firebaseUser.uid));
        unsubNotifications = onSnapshot(qNotifications, (snap) => {
          const loaded: NotificationDoc[] = [];
          let latestArrival: any = null;
          
          snap.forEach((doc) => {
            const data = doc.data() as NotificationDoc;
            loaded.push({ ...data, id: doc.id });

            if (data.type === 'arrival' && !data.read && !alertedArrivalIdsRef.current.has(doc.id)) {
              const diffMs = Date.now() - new Date(data.createdAt).getTime();
              if (diffMs < 45000) { // within last 45 seconds
                latestArrival = { ...data, id: doc.id };
                alertedArrivalIdsRef.current.add(doc.id);
              }
            }
          });
          
          loaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setNotifications(loaded);

          if (latestArrival) {
            import('./utils/audio').then(m => {
              m.playArrivalChime(userProfile?.audioEffectsEnabled !== false);
            });
            setActiveArrivalAlert({
              id: latestArrival.id,
              text: latestArrival.text,
              questId: latestArrival.questId
            });
          }
        }, (e) => console.error("Notifications subscription error:", e));

        // Sub 5: Chats collections subscription
        const qOwnerChats = query(collection(db, 'chats'), where('ownerId', '==', firebaseUser.uid));
        const qApplicantChats = query(collection(db, 'chats'), where('applicantId', '==', firebaseUser.uid));
        const allChatsMap: Record<string, any> = {};

        const updateChatsState = () => {
          const merged = Object.values(allChatsMap).sort((a, b) => {
            const aMsgs = (a as any).messages || [];
            const bMsgs = (b as any).messages || [];
            const aTime = aMsgs.length > 0 ? aMsgs[aMsgs.length - 1].createdAt : "";
            const bTime = bMsgs.length > 0 ? bMsgs[bMsgs.length - 1].createdAt : "";
            return new Date(bTime).getTime() - new Date(aTime).getTime();
          });
          setUserChats(merged);
        };

        unsubChatsOwner = onSnapshot(qOwnerChats, (snap) => {
          snap.forEach((doc) => {
            allChatsMap[doc.id] = { ...doc.data(), id: doc.id };
          });
          updateChatsState();
        }, (e) => console.error("Chats owner subscription error:", e));

        unsubChatsApplicant = onSnapshot(qApplicantChats, (snap) => {
          snap.forEach((doc) => {
            allChatsMap[doc.id] = { ...doc.data(), id: doc.id };
          });
          updateChatsState();
        }, (e) => console.error("Chats applicant subscription error:", e));

        // Sub 6: Users collection snapshot for real-time Leaderboard sync
        unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
          const userProfiles: UserProfile[] = [];
          snap.forEach((docSnap) => {
            userProfiles.push(UserModel.fromFirestore(docSnap.data(), docSnap.id));
          });
          
          // Map user profiles to Leaders
          const mappedLeaders = userProfiles
            .filter(profile => !profile.isBanned)
            .map((profile) => {
              const pts = profile.totalPoints || 0;
              let tier: 'Bronze' | 'Silver' | 'Gold' = 'Bronze';
              if (pts >= 1000) tier = 'Gold';
              else if (pts >= 400) tier = 'Silver';
              
              return {
                id: profile.id,
                name: profile.name || 'مستخدم كويست',
                avatar: profile.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
                points: pts,
                questsCompleted: profile.questsCompleted || 0,
                rating: profile.rating || 5.0,
                rank: 1, // Will be computed in LeaderboardView based on sorted points
                tier: tier,
                isCurrentUser: profile.id === firebaseUser.uid,
                idVerificationStatus: profile.idVerificationStatus,
                isBanned: profile.isBanned
              } as Leader;
            });
            
          setLeaders(mappedLeaders);
          localStorage.setItem('quest_app_leaders', JSON.stringify(mappedLeaders));
        }, (e) => {
          console.error("Users subscription failed: ", e);
        });

      } else {
        setAuthenticatedUser(null);
        setUserProfile(null);
        setQuests([]);
        setNotifications([]);
        setUserChats([]);
        setAuthInitialized(true);
        setLoadedQuests(true);
        setLoadedHunterReviews(true);
        setLoadedGodfatherReviews(true);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      if (unsubQuests) unsubQuests();
      if (unsubReviews) unsubReviews();
      if (unsubGodfatherReviews) unsubGodfatherReviews();
      if (unsubNotifications) unsubNotifications();
      if (unsubChatsOwner) unsubChatsOwner();
      if (unsubChatsApplicant) unsubChatsApplicant();
      if (unsubUsers) unsubUsers();
    };
  }, []);

  // Synchronous and Secure Runner Token Deduction:
  // When the runner sees they have an active quest they are assigned to,
  // we deduct the booking fee from their own profile client-side and sync it.
  useEffect(() => {
    if (!userProfile || !auth.currentUser) return;

    // Find all quests where status is active/arrived/pending_verification/completed
    // and this user is the assigned runner.
    const myActiveQuests = quests.filter(q => 
      (q.status === 'active' || q.status === 'arrived' || q.status === 'pending_verification' || q.status === 'completed') && 
      q.assignedRunnerId === userProfile.id
    );

    let profileUpdated = false;
    let newBalance = userProfile.tokenBalance;

    // Get list of already processed/deducted quest IDs from localStorage
    let deductedIds: string[] = [];
    try {
      const stored = localStorage.getItem('deducted_quest_fees');
      if (stored) {
        deductedIds = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error reading deducted_quest_fees:', e);
    }

    myActiveQuests.forEach(q => {
      if (!deductedIds.includes(q.id)) {
        const fee = q.bookingFeeTokens || Math.max(50, Math.round(q.cashReward * 0.10));
        newBalance = Math.max(0, newBalance - fee);
        deductedIds.push(q.id);
        profileUpdated = true;
      }
    });

    if (profileUpdated) {
      try {
        localStorage.setItem('deducted_quest_fees', JSON.stringify(deductedIds));
        syncProfile({
          ...userProfile,
          tokenBalance: newBalance
        });
        showToast(userProfile.language === 'ar'
          ? '⚡ تم خصم عربون ضمان الجدية والحجز بنجاح للمهمات النشطة.'
          : '⚡ Guarantee booking deposit fee successfully locked for active quests.'
        );
      } catch (err) {
        console.error('Failed to deduct guarantee fee locally: ', err);
      }
    }
  }, [quests, userProfile]);

  // Core Functional Notification Hub helper
  const addNotification = async (userId: string, text: string, questId?: string, type: string = 'info') => {
    if (auth.currentUser) {
      try {
        const notifRef = doc(collection(db, 'notifications'));
        const newNotif = {
          id: notifRef.id,
          userId,
          text,
          questId: questId || "",
          createdAt: new Date().toISOString(),
          read: false,
          type
        };
        await setDoc(notifRef, newNotif);
      } catch (e) {
        console.error("Failed creating cloud notification:", e);
      }
    } else {
      // Offline fallback
      try {
        const key = 'local_notifications';
        const stored = localStorage.getItem(key);
        let list: NotificationDoc[] = [];
        if (stored) {
          list = JSON.parse(stored);
        }
        const newNotif: NotificationDoc = {
          id: `local-notif-${Date.now()}`,
          userId,
          text,
          questId: questId || "",
          createdAt: new Date().toISOString(),
          read: false,
          type
        };
        list.unshift(newNotif);
        localStorage.setItem(key, JSON.stringify(list));
        setNotifications(list);
      } catch (err) {
        console.error("Failed creating local notification:", err);
      }
    }
  };

  // 2. Synchronize states with either cloud database (Firestore) or LocalStorage
  const syncQuests = (newQuests: Quest[], deletedId?: string) => {
    if (auth.currentUser) {
      if (deletedId) {
        deleteDoc(doc(db, 'quests', deletedId)).catch(e => handleFirestoreError(e, OperationType.DELETE, `quests/${deletedId}`));
      }
      
      // Surgical Sync Optimization: only setDoc for quests that changed/added compared to internal state
      const changedQuests = newQuests.filter(q => {
        const existingQ = quests.find(prev => prev.id === q.id);
        if (!existingQ) return true; // Brand new quest!
        return existingQ.status !== q.status ||
               existingQ.flagsCount !== q.flagsCount ||
               existingQ.helperId !== q.helperId ||
               existingQ.assignedRunnerId !== q.assignedRunnerId ||
               existingQ.createdAt !== q.createdAt ||
               existingQ.assignedAt !== q.assignedAt ||
               existingQ.extensionRequestedBy !== q.extensionRequestedBy ||
               existingQ.extensionApprovedBy !== q.extensionApprovedBy ||
               (existingQ.applicants?.length !== q.applicants?.length) ||
               existingQ.proofImageUrl !== q.proofImageUrl ||
               existingQ.title !== q.title ||
               existingQ.description !== q.description ||
               existingQ.location !== q.location;
      });

      changedQuests.forEach((q) => {
        setDoc(doc(db, 'quests', q.id), cleanData(q)).catch(e => handleFirestoreError(e, OperationType.WRITE, `quests/${q.id}`));
      });
    } else {
      setQuests(newQuests);
      localStorage.setItem('quest_app_quests', JSON.stringify(newQuests));
    }
  };

  const syncProfile = (newProfile: UserProfile) => {
    if (auth.currentUser) {
      setDoc(doc(db, 'users', auth.currentUser.uid), cleanData(UserModel.toFirestore(newProfile)), { merge: true })
        .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${auth.currentUser?.uid}`));
    } else {
      setUserProfile(newProfile);
      localStorage.setItem('quest_app_profile', JSON.stringify(newProfile));
    }

    // Leaderboard visual syncing
    const updatedLeaders = leaders.map(leader => {
      if (leader.id === 'user-current' || leader.isCurrentUser || (auth.currentUser && leader.id === auth.currentUser.uid)) {
        return {
          ...leader,
          name: newProfile.name,
          avatar: newProfile.avatar,
          points: newProfile.totalPoints,
          questsCompleted: newProfile.questsCompleted,
          rating: newProfile.rating
        };
      }
      return leader;
    });
    setLeaders(updatedLeaders);
    localStorage.setItem('quest_app_leaders', JSON.stringify(updatedLeaders));
  };

  const syncChallenges = (newChallenges: Challenge[]) => {
    setChallenges(newChallenges);
    localStorage.setItem('quest_app_challenges', JSON.stringify(newChallenges));
  };

  const syncBadges = (newBadges: Badge[]) => {
    setBadges(newBadges);
    localStorage.setItem('quest_app_badges', JSON.stringify(newBadges));
  };

  const syncHunterReviews = (newReviews: HunterReview[], deletedId?: string) => {
    if (auth.currentUser) {
      if (deletedId) {
        deleteDoc(doc(db, 'reviews', deletedId)).catch(e => handleFirestoreError(e, OperationType.DELETE, `reviews/${deletedId}`));
      }
      
      // Surgical Sync Optimization: only write reviews that actually changed or are brand new
      const changedReviews = newReviews.filter(r => {
        const existingR = hunterReviews.find(prev => prev.reviewId === r.reviewId);
        if (!existingR) return true; // Brand new review!
        return existingR.rating !== r.rating ||
               existingR.comment !== r.comment ||
               existingR.godfatherName !== r.godfatherName;
      });

      changedReviews.forEach((r) => {
        setDoc(doc(db, 'reviews', r.reviewId), cleanData(r)).catch(e => handleFirestoreError(e, OperationType.WRITE, `reviews/${r.reviewId}`));
      });
    } else {
      setHunterReviews(newReviews);
      localStorage.setItem('quest_app_hunter_reviews', JSON.stringify(newReviews));
    }
  };

  const syncGodfatherReviews = (newGReviews: GodfatherReview[], deletedId?: string) => {
    if (auth.currentUser) {
      if (deletedId) {
        deleteDoc(doc(db, 'godfather_reviews', deletedId)).catch(e => handleFirestoreError(e, OperationType.DELETE, `godfather_reviews/${deletedId}`));
      }
      const changedReviews = newGReviews.filter(r => {
        const existingR = godfatherReviews.find(prev => prev.reviewId === r.reviewId);
        if (!existingR) return true;
        return existingR.rating !== r.rating ||
               existingR.comment !== r.comment ||
               existingR.hunterName !== r.hunterName;
      });
      changedReviews.forEach((r) => {
        setDoc(doc(db, 'godfather_reviews', r.reviewId), cleanData(r)).catch(e => handleFirestoreError(e, OperationType.WRITE, `godfather_reviews/${r.reviewId}`));
      });
    } else {
      setGodfatherReviews(newGReviews);
      localStorage.setItem('quest_app_godfather_reviews', JSON.stringify(newGReviews));
    }
  };

  const handleSaveHunterReviewFromReciprocal = (newReview: HunterReview) => {
    const updatedReviews = [newReview, ...hunterReviews];
    syncHunterReviews(updatedReviews);
    setActiveRatingQuestId(null);
    showToast(userProfile?.language === 'ar' ? '✅ تم وضع مراجعة العامل بنجاح وتحديث نقاط السمعة!' : '✅ Worker review broadcast successfully and trust rating updated!');
  };

  const handleSaveGodfatherReviewFromReciprocal = (newReview: GodfatherReview) => {
    const updatedGReviews = [newReview, ...godfatherReviews];
    syncGodfatherReviews(updatedGReviews);
    setActiveRatingQuestId(null);
    showToast(userProfile?.language === 'ar' ? '✅ تم وضع تقييم صاحب العمل المتبادل وتكريم العميل بنجاح!' : '✅ Respective Client review broadcast successfully!');
  };

  const handleDeleteHunterReview = (reviewId: string) => {
    const updatedReviews = hunterReviews.filter(r => r.reviewId !== reviewId);
    syncHunterReviews(updatedReviews, reviewId);

    // If we have reviews left for current user, recalculate
    if (userProfile) {
      const myReviews = updatedReviews.filter(r => r.hunterId === userProfile.id);
      const averageRating = myReviews.length > 0 
        ? myReviews.reduce((sum, r) => sum + r.rating, 0) / myReviews.length 
        : 5.0; // fallback default
      syncProfile({
        ...userProfile,
        rating: Number(averageRating.toFixed(1))
      });
    }
    showToast('تم حذف التقييم ومراجعة العمل من ملفك الشخصي بنجاح.');
  };

  // Trigger automatic map navigation routing immediately on successful contract activation
  useEffect(() => {
    if (!userProfile) return;

    const activeQuestAssignedToMe = quests.find(
      q => q.assignedRunnerId === userProfile.id && q.status === 'active'
    );

    if (activeQuestAssignedToMe && (!navigatingQuest || navigatingQuest.id !== activeQuestAssignedToMe.id)) {
      setNavigatingQuest({
        ...activeQuestAssignedToMe,
        status: 'booked' as const // Ensure the MapView treats it as booked/active tracking
      });
      handleViewNavigation('map');
      showToast(userProfile.language === 'ar'
        ? '🚀 تم قبولك في الكويست! الملاحة وتوجيه GPS بدأ تلقائياً.'
        : '🚀 You were accepted for this quest! GPS navigation launched automatically.'
      );
    }
  }, [quests, userProfile, navigatingQuest]);

  // Automatic completed quest reciprocal ratings trigger
  useEffect(() => {
    if (!userProfile) return;
    
    // Only proceed once database snapshots of lists are completed fetching
    if (!loadedQuests || !loadedHunterReviews || !loadedGodfatherReviews) {
      return;
    }
    
    // Find any completed quest that this user hasn't rated yet
    const unratedCompletedQuest = quests.find(q => {
      if (q.status !== 'completed') return false;
      
      const isCreator = q.creatorId === userProfile.id;
      const isRunner = q.helperId === userProfile.id || q.assignedRunnerId === userProfile.id || (q.assignedRunnerIds && q.assignedRunnerIds.includes(userProfile.id));
      
      if (isCreator) {
        // Did the creator rate this runner?
        const alreadyRated = hunterReviews.some(r => r.reviewId === `rev-${q.id}`);
        return !alreadyRated;
      } else if (isRunner) {
        // Did the runner rate this creator?
        const alreadyRated = godfatherReviews.some(r => r.reviewId === `g-rev-${q.id}`);
        return !alreadyRated;
      }
      return false;
    });

    if (unratedCompletedQuest) {
      if (activeRatingQuestId !== unratedCompletedQuest.id) {
        setActiveRatingQuestId(unratedCompletedQuest.id);
      }
    } else {
      if (activeRatingQuestId !== null) {
        setActiveRatingQuestId(null);
      }
    }
    
    // Check successfully run to completion
    setIsLoadingRating(false);
  }, [quests, userProfile, hunterReviews, godfatherReviews, activeRatingQuestId, loadedQuests, loadedHunterReviews, loadedGodfatherReviews]);

  // Global listener for open-chat to auto-navigate to my-quests and clear in modal
  useEffect(() => {
    const handleOpenChatGlobal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setDeferredActiveChat(detail);
        setCurrentView('my-quests');
      }
    };
    window.addEventListener('open-chat', handleOpenChatGlobal);
    return () => window.removeEventListener('open-chat', handleOpenChatGlobal);
  }, []);

  // Global listener for view-public-profile to instantly view a user's account profile
  useEffect(() => {
    const handleViewProfileGlobal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.userId) {
        setSelectedPublicProfileId(detail.userId);
      }
    };
    window.addEventListener('view-public-profile', handleViewProfileGlobal);
    return () => window.removeEventListener('view-public-profile', handleViewProfileGlobal);
  }, []);

  // Set isLoadingRating to false if user is a guest/logged out
  useEffect(() => {
    if (authInitialized && !userProfile) {
      setIsLoadingRating(false);
    }
  }, [authInitialized, userProfile]);

  // Premium entry splash animations and timing controls
  useEffect(() => {
    const minTimer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 2500);

    const shrinkTimer = setTimeout(() => {
      setAnimationPhase('shrink');
    }, 900);

    const textTimer = setTimeout(() => {
      setAnimationPhase('text-fade');
    }, 1200);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(shrinkTimer);
      clearTimeout(textTimer);
    };
  }, []);

  // Sync splashActive and splashFadeOut turning off
  useEffect(() => {
    if (minTimeElapsed && authInitialized) {
      if (!userProfile || !isLoadingRating) {
        setSplashFadeOut(true);
        const timer = setTimeout(() => {
          setSplashActive(false);
        }, 700);
        return () => clearTimeout(timer);
      }
    }
  }, [minTimeElapsed, authInitialized, userProfile, isLoadingRating]);

  // Global listener for manage-quest to auto-navigate to my-quests (created tab)
  useEffect(() => {
    const handleManageQuestGlobal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.questId) {
        setMyQuestsActiveTab('created');
        setInitialSelectedQuestId(detail.questId);
        setCurrentView('my-quests');
        setGlobalQuestDetailId(null);
      }
    };
    window.addEventListener('manage-quest', handleManageQuestGlobal);
    return () => window.removeEventListener('manage-quest', handleManageQuestGlobal);
  }, []);

  // Global listener for navigate-to-quest-map to auto-navigate to map and start navigating a quest
  useEffect(() => {
    const handleNavigateQuestMapGlobal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.quest) {
        setNavigatingQuest(detail.quest);
        handleViewNavigation('map');
        setGlobalQuestDetailId(null);
      }
    };
    window.addEventListener('navigate-to-quest-map', handleNavigateQuestMapGlobal);
    return () => window.removeEventListener('navigate-to-quest-map', handleNavigateQuestMapGlobal);
  }, []);

  const renderSplashContent = () => (
    <div className={`fixed -inset-2 bg-[#0B132B] flex items-center justify-center font-sans px-6 select-none overflow-hidden z-[99999] transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${
      splashFadeOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
    }`}>
      {/* Subtle, luxurious Ambient Glow in the background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-[#FC0D82]/5 blur-[120px] pointer-events-none"></div>

      <div className="relative flex items-center justify-center w-[320px] h-[120px] z-10 select-none pointer-events-none">
        {/* Logo element with Zoom & Shrink/Move animation */}
        <motion.div
          animate={{
            scale: animationPhase === 'zoom' ? 1.6 : 1.0,
            x: animationPhase === 'zoom' ? 0 : -64,
          }}
          transition={{
            type: "spring",
            stiffness: 100,
            damping: 18,
          }}
          className="absolute flex items-center justify-center shrink-0 select-none pointer-events-none"
        >
          <QuestLogo size="xl" iconOnly={true} />
        </motion.div>

        {/* Staggered Text "Quest" appearing next to the logo on the right */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ 
            opacity: animationPhase === 'text-fade' ? 1 : 0,
            x: animationPhase === 'text-fade' ? 56 : 20
          }}
          transition={{
            duration: 0.6,
            ease: [0.16, 1, 0.3, 1] // professional cubic-bezier ease out
          }}
          className="absolute flex items-center justify-center"
        >
          <span 
            style={{ letterSpacing: '-0.04em' }}
            className="font-sans font-black italic tracking-tighter uppercase select-none text-white text-5xl sm:text-6xl"
          >
            Quest
          </span>
        </motion.div>
      </div>
    </div>
  );

  if (splashActive) {
    return renderSplashContent();
  }

  if (!userProfile) {
    return <AuthScreen showToast={showToast} lang="ar" />;
  }

  // Helper action: Recalculate level up based on points (each 600 points raises a level)
  const calculateLevelForPoints = (points: number) => {
    const calculatedLevel = Math.max(1, Math.floor(points / 600) + 1);
    return calculatedLevel;
  };

  // Helper action: Calculate true geodesic distance using Haversine formula
  const calculateDistanceKmWithCoords = (qLat: number, qLng: number, uLat: number, uLng: number) => {
    const R = 6371; // Earth major radius in km
    const dLat = (qLat - uLat) * Math.PI / 180;
    const dLng = (qLng - uLng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(uLat * Math.PI / 180) * Math.cos(qLat * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = R * c;
    return parseFloat(dist.toFixed(1));
  };

  const calculateDistanceKm = (qLat: number, qLng: number) => {
    return calculateDistanceKmWithCoords(qLat, qLng, userLoc.lat, userLoc.lng);
  };



  const verifyGpsHardwareAndExecute = async (
    actionType: 'publish' | 'book',
    params: any,
    onPassed: (coords: { lat: number; lng: number }) => void
  ) => {
    // Check if we need to show the explanation dialog first (Rule 5: first time per session)
    const hasAcceptedExplain = sessionStorage.getItem('gps_explain_accepted') === 'true';

    const performHardwareFetch = async () => {
      showToast(userProfile?.language === 'ar' ? '⏳ جاري الاتصال بحساسات موقع الجهاز المادية (GPS)...' : '⏳ Connecting to device hardware GPS sensors...');
      try {
        if (!navigator.geolocation) {
          setGpsSecurityError(userProfile?.language === 'ar' ? '⚠️ تحديد الموقع المادي غير مدعوم في هذا الجهاز' : '⚠️ Physical location hardware is unsupported on this device.');
          return;
        }

        // Action-Triggered Physical GPS payload with best accuracy setup (LocationAccuracy.bestForNavigation equivalent in Web Geolocation API)
        navigator.geolocation.getCurrentPosition(
          (position) => {
            // Rule 4: Anti-Mock Check
            const isMocked = 
              (position as any).mocked === true ||
              (position.coords as any).isFromMockProvider === true ||
              (position.coords as any).mocked === true ||
              position.coords.accuracy === 0 ||
              localStorage.getItem('simulate_mock_gps') === 'true';

            if (isMocked) {
              setGpsSecurityError(userProfile?.language === 'ar'
                ? 'تم رصد تطبيق لتزوير الموقع، يرجى إيقافه للاستمرار في كويست'
                : 'Location spoofing app detected. Please disable it to continue using Quest.'
              );
              return;
            }

            // Foreground coordinates fetched successfully
            const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
            
            // Save last known real coordinates
            setUserLoc(coords);
            localStorage.setItem('last_user_lat', coords.lat.toString());
            localStorage.setItem('last_user_lng', coords.lng.toString());
            
            // Execute the action with real coordinates!
            onPassed(coords);
          },
          (error) => {
            console.error("Hardware GPS Fetch failed:", error);
            // Rule 3: "إذا كان الـ GPS معطلاً في الهاتف عند لحظة الضغط، يتم حظر العملية وإظهار رسالة نظيفة: "يرجى تفعيل موقع الجهاز (GPS) لإتمام العملية"
            setGpsSecurityError(userProfile?.language === 'ar'
              ? 'يرجى تفعيل موقع الجهاز (GPS) لإتمام العملية'
              : 'Please enable device location services (GPS) to complete the operation.'
            );
          },
          {
            enableHighAccuracy: true, // LocationAccuracy.bestForNavigation
            timeout: 10000,
            maximumAge: 0 // Do not use cached GPS
          }
        );
      } catch (err) {
        setGpsSecurityError(userProfile?.language === 'ar' ? 'يرجى تفعيل موقع الجهاز (GPS) لإتمام العملية' : 'Please enable device location services (GPS) to complete the operation.');
      }
    };

    if (!hasAcceptedExplain) {
      setExplainReason(actionType);
      setPendingGpsParams({ params, performHardwareFetch });
      setShowGpsExplainDialog(true);
    } else {
      await performHardwareFetch();
    }
  };

  // Callback 1: Apply for Quest (Multi-Applicant pipeline) - NOW PROTECTED BY HARDWARE GPS ENFORCEMENT
  const handleBookQuest = (questId: string, bookingFee: number) => {
    if (!userProfile) return;

    const targetQuest = quests.find(q => q.id === questId);
    if (!targetQuest) return;

    // Calculate dynamic implicit fee: 10% of cashReward, minimum 50 tokens
    const implicitPlatformFee = Math.max(50, Math.round(targetQuest.cashReward * 0.10));

    if (userProfile.tokenBalance < implicitPlatformFee) {
      setRequiredRefillFee(implicitPlatformFee);
      setShowKycRefillPromptModal(true);
      return;
    }

    if (targetQuest.creatorId === userProfile.id) {
      showToast(userProfile.language === 'ar' 
        ? '⚠️ لا يمكنك التقديم على كويست قمت بنشره بنفسك!' 
        : '⚠️ You cannot apply to your own quests!'
      );
      return;
    }

    const alreadyApplied = targetQuest.applicants?.some(app => app.userId === userProfile.id);
    if (alreadyApplied) {
      showToast(userProfile.language === 'ar' 
        ? '⚠️ لقد قمت بالتقديم على هذا الكويست مسبقاً.' 
        : '⚠️ You already applied to this quest.'
      );
      return;
    }

    // Trigger strict action-based hardware GPS checks before booking is finalized (Rule 3)
    verifyGpsHardwareAndExecute('book', { questId, bookingFee }, (coords) => {
      // Recalculate distance using verified real physical coordinates
      const trueDistance = calculateDistanceKmWithCoords(targetQuest.lat, targetQuest.lng, coords.lat, coords.lng);
      if (trueDistance > 50) {
        showToast(userProfile.language === 'ar'
          ? `📍 هذه المهمة خارج نطاقك الجغرافي المتاح للحجز (المسافة: ${trueDistance} كم، الحد الأقصى: 50 كم)`
          : `📍 This quest is outside your available geographical booking limit (Distance: ${trueDistance}km, Limit: 50km)`
        );
        return;
      }

      const newApplicant = {
        userId: userProfile.id,
        name: userProfile.name,
        avatar: userProfile.avatar,
        rating: userProfile.rating || 5.0,
        questsCompleted: userProfile.questsCompleted || 0,
        phone: userProfile.phone || '0555123456'
      };

      const updatedQuests = quests.map(q => {
        if (q.id === questId) {
          return {
            ...q,
            applicants: [...(q.applicants || []), newApplicant]
          };
        }
        return q;
      });

      syncQuests(updatedQuests);

      showToast(userProfile.language === 'ar' 
        ? '✅ تم تقديم طلبك بنجاح.. في انتظار اختيار صاحب العمل ⏳' 
        : '✅ Application submitted successfully.. awaiting creator selection ⏳'
      );

      // Contextual Chat Activation: Create chat doc with first system message
      const chatId = `${questId}_${targetQuest.creatorId}_${userProfile.id}`;
      const initMessage = {
        id: 'msg-init',
        senderId: 'system',
        senderName: 'نظام كويست / System',
        text: userProfile.language === 'ar'
          ? `👋 تم تقديم طلب جديد من ${userProfile.name}! يمكنك التنسيق هنا والاتفاق على التفاصيل واللوازم.`
          : `👋 New application submitted by ${userProfile.name}! Chat here to align details and equipment.`,
        createdAt: new Date().toISOString()
      };

      if (auth.currentUser) {
        const chatsRef = doc(db, 'chats', chatId);
        setDoc(chatsRef, {
          id: chatId,
          questId,
          questTitle: targetQuest.title,
          ownerId: targetQuest.creatorId,
          ownerName: targetQuest.creatorName,
          ownerAvatar: targetQuest.creatorAvatar,
          applicantId: userProfile.id,
          applicantName: userProfile.name,
          applicantAvatar: userProfile.avatar,
          messages: [initMessage]
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`));
      } else {
        // Local fallback for offline/guest modes
        try {
          const key = `local_chat_${chatId}`;
          const localChatData = {
            id: chatId,
            questId,
            questTitle: targetQuest.title,
            ownerId: targetQuest.creatorId,
            ownerName: targetQuest.creatorName,
            ownerAvatar: targetQuest.creatorAvatar,
            applicantId: userProfile.id,
            applicantName: userProfile.name,
            applicantAvatar: userProfile.avatar,
            messages: [initMessage]
          };
          localStorage.setItem(key, JSON.stringify(localChatData));
        } catch (e) {
          console.error('Error saving local chat fallback:', e);
        }
      }

      // Realtime notification alert for owner
      addNotification(
        targetQuest.creatorId,
        `تقدم الكابتن ${userProfile.name} لمهمتك ${targetQuest.title}. راجع بروفايله الآن! 👥`,
        targetQuest.id,
        'applicant'
      );
    });
  };

  // Extension System - Rule 1: Manual 8-Hour Pending Quest Extension
  const handleExtendPendingQuest = (questId: string) => {
    if (!userProfile) return;

    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        return {
          ...q,
          createdAt: new Date().toISOString() // resets the 8-hour publication countdown
        };
      }
      return q;
    });

    syncQuests(updatedQuests);

    showToast(userProfile.language === 'ar'
      ? '⏰ تم تمديد صلاحية نشر الكويست بنجاح لـ 8 ساعات إضافية!'
      : '⏰ Quest publication validity successfully extended for 8 additional hours!'
    );
  };

  // Extension System - Rule 2: 24-Hour Active Contract Mutual Extension
  const handleExtendActiveContract = (questId: string) => {
    if (!userProfile) return;

    const targetQuest = quests.find(q => q.id === questId);
    if (!targetQuest) return;

    const isCreator = targetQuest.creatorId === userProfile.id;
    const runnerId = targetQuest.helperId || targetQuest.assignedRunnerId || targetQuest.assignedRunnerIds?.[0];

    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        // If other party requested it, approve & reset assignedAt to extend contract life for 24h
        if (q.extensionRequestedBy && q.extensionRequestedBy !== userProfile.id) {
          return {
            ...q,
            assignedAt: new Date().toISOString(), // resets 24h timeline
            extensionRequestedBy: null,
            extensionApprovedBy: userProfile.id
          };
        } else {
          // Send request setting current user as the requester
          return {
            ...q,
            extensionRequestedBy: userProfile.id
          };
        }
      }
      return q;
    });

    const isApprovedNow = targetQuest.extensionRequestedBy && targetQuest.extensionRequestedBy !== userProfile.id;

    syncQuests(updatedQuests);

    if (isApprovedNow) {
      // Send real-time notification to the other party
      const otherUserId = isCreator ? runnerId : targetQuest.creatorId;
      if (otherUserId) {
        addNotification(
          otherUserId,
          userProfile.language === 'ar'
            ? `🤝 وافق الطرف الآخر على تمديد عقد المهمة "${targetQuest.title}" لمدة 24 ساعة إضافية!`
            : `🤝 The other party approved extending "${targetQuest.title}" contract for 24 more hours!`,
          targetQuest.id,
          'message'
        );
      }

      showToast(userProfile.language === 'ar'
        ? '🤝 تم الموافقة المتبادلة وتمديد العمل بنجاح لـ 24 ساعة إضافية!'
        : '🤝 Mutual extension approved! Contract successfully extended for 24 hours!'
      );
    } else {
      const otherUserId = isCreator ? runnerId : targetQuest.creatorId;
      if (otherUserId) {
        addNotification(
          otherUserId,
          userProfile.language === 'ar'
            ? `⏳ يطلب الطرف الآخر تمديد مهلة العمل لمهمة "${targetQuest.title}" لـ 24 ساعة إضافية. يرجى المراجعة والموافقة!`
            : `⏳ The other party requested extending "${targetQuest.title}" contract deadline for 24h. Please review & approve!`,
          targetQuest.id,
          'message'
        );
      }

      showToast(userProfile.language === 'ar'
        ? '⏳ تم إرسال طلب التمديد.. بانتظار موافقة الطرف الآخر!'
        : '⏳ Extension request sent.. Awaiting other party approval!'
      );
    }
  };

  // Callback 1.1: Accept applicant and lock the contract (firebase state updates & programmatic notification)
  const handleAcceptApplicant = async (questId: string, applicantId: string) => {
    if (!userProfile) return;

    const targetQuest = quests.find(q => q.id === questId);
    if (!targetQuest) return;

    // Calculate implicit platform fee: 10% of cashReward, minimum 50 tokens
    const fee = Math.max(50, Math.round(targetQuest.cashReward * 0.10));

    // Update locally and inside public profile synced state
    if (applicantId === userProfile.id) {
      syncProfile({
        ...userProfile,
        isAvailable: false,
        tokenBalance: Math.max(0, userProfile.tokenBalance - fee)
      });
    }

    // Update applicant's global status and deduct tokens if possible in Firestore
    try {
      if (applicantId === userProfile.id) {
        await setDoc(doc(db, 'users', applicantId), { 
          isAvailable: false,
          tokenBalance: Math.max(0, userProfile.tokenBalance - fee)
        }, { merge: true });
      } else {
        await setDoc(doc(db, 'users', applicantId), { isAvailable: false }, { merge: true });
      }
    } catch (err) {
      console.warn("Could not set user availability or deduct tokens in DB:", err);
    }

    const selectedApplicant = targetQuest.applicants?.find(app => app.userId === applicantId);

    // Support multi-slot hiring
    const limitCount = targetQuest.requiredWorkerCount || 1;
    const currentAssigned = targetQuest.assignedRunnerIds || [];

    if (currentAssigned.includes(applicantId)) {
      showToast(userProfile.language === 'ar' ? '⚠️ هذا العامل معين بالفعل لهذه المهمة!' : '⚠️ This worker is already assigned to this quest!');
      return;
    }

    const updatedAssigned = [...currentAssigned, applicantId];
    // If we've reached the required limit, mark fully booked
    const isFullyBooked = updatedAssigned.length >= limitCount;

    // Officially bind the runner & activate contract
    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        return {
          ...q,
          status: (isFullyBooked ? 'active' : 'open') as any, // Only flip to 'active' once fully booked
          helperId: applicantId, // fallback
          helperName: selectedApplicant?.name || 'صياد كويست',
          helperPhone: selectedApplicant?.phone || '0555123456',
          assignedRunnerId: applicantId, // fallback
          assignedRunnerIds: updatedAssigned,
          assignedAt: new Date().toISOString()
        };
      }
      return q;
    });

    syncQuests(updatedQuests);

    // Notify the newly accepted runner via system message
    const approvedChatId = `${questId}_${targetQuest.creatorId}_${applicantId}`;
    
    // Programmatically open chat window directly for immediate live interaction
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-chat', {
        detail: {
          chatId: approvedChatId,
          questTitle: targetQuest.title,
          recipientName: selectedApplicant?.name || 'صياد كويست',
          recipientAvatar: selectedApplicant?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=Runner&backgroundColor=f43f5e'
        }
      }));
    }, 100);
    const noticeText = '🤝 مبروك! لقد تم اختيارك وتفعيل العقد رسمياً لهذه المهمة. الملاحة والعمل الميداني نشط الآن!';
    addNotification(
      applicantId,
      `تم قبول طلبك لمهمة ${targetQuest.title}! افتح الخريطة لبدء التوجيه الميداني الحركي 🛰️`,
      questId,
      'approved'
    );
    sendPushNotification(
      applicantId,
      userProfile.language === 'ar' ? '🎉 تم قبول طلبك!' : '🎉 Bid Accepted!',
      userProfile.language === 'ar' 
        ? `تم قبول طلبك لمهمة "${targetQuest.title}"! افتح الخريطة لبدء التوجيه الميداني.`
        : `You have been selected for "${targetQuest.title}"! Click to view navigation details.`,
      { questId }
    );

    if (auth.currentUser) {
      const chatDocRef = doc(db, 'chats', approvedChatId);
      try {
        const chatSnap = await getDoc(chatDocRef);
        if (chatSnap.exists()) {
          const chatData = chatSnap.data();
          const currentMessages = chatData.messages || [];
          await setDoc(chatDocRef, {
            ...chatData,
            messages: [
              ...currentMessages,
              {
                id: `notice-${Date.now()}`,
                senderId: 'system',
                senderName: 'نظام كويست / System',
                text: noticeText,
                createdAt: new Date().toISOString()
              }
            ]
          }, { merge: true });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `chats/${approvedChatId}`);
      }
    } else {
      // Offline fallback
      try {
        const key = `local_chat_${approvedChatId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          const currentMessages = parsed.messages || [];
          parsed.messages = [
            ...currentMessages,
            {
              id: `notice-${Date.now()}`,
              senderId: 'system',
              senderName: 'نظام كويست / System',
              text: noticeText,
              createdAt: new Date().toISOString()
            }
          ];
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch (e) {
        console.error('Failed to post local notice info:', e);
      }
    }

    // Dismiss other applicants ONLY if fully booked
    if (isFullyBooked && targetQuest.applicants) {
      targetQuest.applicants.forEach(async (app) => {
        if (updatedAssigned.includes(app.userId)) return; // Already hired for a slot!

        const otherChatId = `${questId}_${targetQuest.creatorId}_${app.userId}`;
        const otherNoticeText = 'عذراً، تم اختيار كابتن آخر لهذه المهمة. بالتوفيق في كويست قادم! 🎯';

        addNotification(
          app.userId,
          `عذراً، تم اختيار كابتن آخر لمهمة ${targetQuest.title}. بالتوفيق في كويست قادم! 🎯`,
          questId,
          'dismissed'
        );
        sendPushNotification(
          app.userId,
          userProfile.language === 'ar' ? '🎯 تحديث حالة الكويست' : '🎯 Quest Status Update',
          userProfile.language === 'ar'
            ? `عذراً، تم اختيار كابتن آخر لمهمة ${targetQuest.title}. بالتوفيق في المرات القادمة!`
            : `Sorry, another captain was selected for ${targetQuest.title}. Wish you luck next time!`,
          { questId }
        );

        if (auth.currentUser) {
          const chatDocRef = doc(db, 'chats', otherChatId);
          try {
            const chatSnap = await getDoc(chatDocRef);
            if (chatSnap.exists()) {
              const chatData = chatSnap.data();
              const currentMessages = chatData.messages || [];
              await setDoc(chatDocRef, {
                ...chatData,
                messages: [
                  ...currentMessages,
                  {
                    id: `notice-${Date.now()}`,
                    senderId: 'system',
                    senderName: 'نظام كويست / System',
                    text: otherNoticeText,
                    createdAt: new Date().toISOString()
                  }
                ]
              }, { merge: true });
            }
          } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `chats/${otherChatId}`);
          }
        } else {
          // Local storage fallback
          try {
            const key = `local_chat_${otherChatId}`;
            const stored = localStorage.getItem(key);
            if (stored) {
              const parsed = JSON.parse(stored);
              const currentMessages = parsed.messages || [];
              parsed.messages = [
                ...currentMessages,
                {
                  id: `notice-${Date.now()}`,
                  senderId: 'system',
                  senderName: 'نظام كويست / System',
                  text: otherNoticeText,
                  createdAt: new Date().toISOString()
                }
              ];
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch (e) {
            console.error('Failed to post local dismiss notice:', e);
          }
        }
      });
    }

    showToast(userProfile.language === 'ar'
      ? '🤝 تم قبول الطلب وتفعيل العقد بنجاح!'
      : '🤝 Application approved and contract activated successfully!'
    );
  };

  // Callback 1.2: Arrive at Quest Location (Tactical geofence trigger closure)
  const handleArrivedAtQuest = (questId: string) => {
    const targetQuest = quests.find(q => q.id === questId);
    if (targetQuest && userProfile) {
      addNotification(
        targetQuest.creatorId,
        `وصل الكابتن ${userProfile.name} إلى موقع المهمة وهو جاهز للتنفيذ 🏁`,
        questId,
        'arrival'
      );
    }

    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        return {
          ...q,
          status: 'arrived' as const
        };
      }
      return q;
    });
    
    // Updates firestore & local state
    syncQuests(updatedQuests);

    showToast(userProfile?.language === 'ar' 
      ? '🏁 لقد تم إرسال تنبيه الوصول الميداني بنجاح! تم إخطار صاحب العمل تلقائياً.' 
      : '🏁 Arrival alert dispatched! Freelance publisher notified in real-time.'
    );

    // Dynamic clean-up layout parameters (shuts down track session & OSRM)
    setNavigatingQuest(null);

    // Redirect straight to "عقودي" (My Contracts / obligations tab)
    setCurrentView('my-quests');
  };

  // Callback 1.5: Flag Quest
  const handleFlagQuest = (questId: string) => {
    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        const flaggerList = q.flaggers || [];
        if (!flaggerList.includes(userProfile.id)) {
          const newFlaggers = [...flaggerList, userProfile.id];
          const newFlagsCount = q.flagsCount + 1;
          
          // SCAM SHIELD: If 3 or more community flags accumulate, freeze or warn!
          if (newFlagsCount >= 3) {
            showToast('🚨 تم تجميد العرض تلقائياً بواسطة درع الأمان (Scam Shield) لوجود بلاغات احتيال متعددة!');
          }
          
          return {
            ...q,
            flagsCount: newFlagsCount,
            flaggers: newFlaggers
          };
        }
      }
      return q;
    });
    syncQuests(updatedQuests);
    showToast('شكراً لبلاغك! سيقوم نظام درع الاحتيال بمراجعة هذا العرض وفحصه جلياً.');
  };

  // Callback 2: Deliver and finalize accepted quest, earning cash and points
  const handleCompleteAcceptedQuest = (questId: string) => {
    const targetQuest = quests.find(q => q.id === questId);
    if (!targetQuest) return;

    // Mark quest status as completed
    const updatedQuests = quests.map(quest => {
      if (quest.id === questId) {
        return { ...quest, status: 'completed' as const };
      }
      return quest;
    });
    syncQuests(updatedQuests);

    // Increase user point balance, quests completed numbers, ratings and level calculations
    // Shift primary XP from static tasks to active Quest completion expenditures: Multiply booking fee tokens * 3
    const questTokensCost = targetQuest.bookingFeeTokens || targetQuest.requiredTokens || Math.max(50, Math.round((targetQuest.cashReward || 1000) * 0.10));
    const dynamicXPReward = questTokensCost * 3;
    const updatedPoints = userProfile.totalPoints + dynamicXPReward;
    const updatedCompletedQuestsCount = userProfile.questsCompleted + 1;
    const calculatedLevel = calculateLevelForPoints(updatedPoints);

    // Append completed quest id safely
    const storedCompletedIds = [...userProfile.completedQuestsIds];
    if (!storedCompletedIds.includes(questId)) {
      storedCompletedIds.push(questId);
    }

    // Auto-unlock standard badges based on thresholds
    const unlockedBadgeIds = [...userProfile.unlockedBadgeIds];
    if (updatedCompletedQuestsCount >= 5 && !unlockedBadgeIds.includes('badge-hero-neighborhood')) {
      unlockedBadgeIds.push('badge-hero-neighborhood');
      showToast('🎖️ إنجاز مذهل: لقد فتحت شارة بطل الحي المحنك!');
    }
    // Check if urgent completed
    if (targetQuest.urgency === 'urgent' && !unlockedBadgeIds.includes('badge-speedster')) {
      unlockedBadgeIds.push('badge-speedster');
      showToast('⚡ إنجاز مستعجل: فتحت شارة المنقذ السريع الصاعق!');
    }

    syncProfile({
      ...userProfile,
      totalPoints: updatedPoints,
      questsCompleted: updatedCompletedQuestsCount,
      level: calculatedLevel,
      completedQuestsIds: storedCompletedIds,
      unlockedBadgeIds,
    });

    // Handle Challenge points progression (Points targets update using dynamic HP/XP converted reward)
    const updatedChallenges = challenges.map(challenge => {
      if (challenge.type === 'points') {
        return {
          ...challenge,
          currentCount: Math.min(challenge.targetCount, challenge.currentCount + dynamicXPReward)
        };
      }
      return challenge;
    });
    syncChallenges(updatedChallenges);

    // Free the runner(s) assigned to this quest back to true
    const assignedRunners = targetQuest.assignedRunnerIds && targetQuest.assignedRunnerIds.length > 0
      ? targetQuest.assignedRunnerIds
      : [targetQuest.helperId || targetQuest.assignedRunnerId].filter(Boolean) as string[];

    assignedRunners.forEach(async (runnerId) => {
      try {
        await setDoc(doc(db, 'users', runnerId), { isAvailable: true }, { merge: true });
      } catch (err) {
        console.warn("Could not set runner availability to true:", err);
      }
      
      // Guest fallback if current user is one of the runners
      if (!auth.currentUser && runnerId === userProfile.id) {
        syncProfile({
          ...userProfile,
          isAvailable: true
        });
      }
    });

    showToast(`عمل ممتاز! تم تسليم الخدمة وحساب +${targetQuest.cashReward} ريال مكافأة مالية في رصيدك و +${targetQuest.pointsReward} نقطة شرفية! 🎉`);
  };

  // Callback 2.1: Cancel Booked Quest and refund strictly 30% token fee
  const handleCancelBookedQuest = (questId: string, refundedTokens: number) => {
    const targetQuest = quests.find(q => q.id === questId);
    const refundRate = 0.30;
    const finalRefundTokens = targetQuest 
      ? Math.round(targetQuest.bookingFeeTokens * refundRate) 
      : Math.round(refundedTokens);

    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        return {
          ...q,
          status: 'open' as const,
          helperId: undefined,
          helperName: undefined,
          helperPhone: undefined
        };
      }
      return q;
    });
    syncQuests(updatedQuests);

    syncProfile({
      ...userProfile,
      tokenBalance: userProfile.tokenBalance + finalRefundTokens
    });

    showToast(userProfile.language === 'ar' 
      ? `تم إلغاء الحجز بنجاح! تم استيراد ريفاوند 30% بقيمة (${finalRefundTokens} رمز) لمحفظتك.`
      : `Quest booking canceled. Refunded strictly 30% (${finalRefundTokens} tokens) to your wallet.`
    );
  };

  // Callback 2.2: Upload Proof image
  const handleUploadProof = (questId: string, proofUrl: string) => {
    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        return {
          ...q,
          status: 'pending_verification' as const,
          proofImageUrl: proofUrl
        };
      }
      return q;
    });
    syncQuests(updatedQuests);
    showToast('تم رفع لقطة الشاشة إثبات تسليم العمل بنجاح ونقله لقيد تفعيل الدفع من صاحب العمل!');
  };

  // Callback 2.3: Confirm payout and complete quest
  const handleConfirmPayout = (questId: string, rating?: number, comment?: string) => {
    const targetQuest = quests.find(q => q.id === questId);
    if (!targetQuest) return;

    // Mark quest status as completed
    const updatedQuests = quests.map(quest => {
      if (quest.id === questId) {
        return { ...quest, status: 'completed' as const };
      }
      return quest;
    });
    syncQuests(updatedQuests);

    // Free the runner(s) assigned to this quest back to true
    const assignedRunners = targetQuest.assignedRunnerIds && targetQuest.assignedRunnerIds.length > 0
      ? targetQuest.assignedRunnerIds
      : [targetQuest.helperId || targetQuest.assignedRunnerId].filter(Boolean) as string[];

    assignedRunners.forEach(async (runnerId) => {
      try {
        await setDoc(doc(db, 'users', runnerId), { isAvailable: true }, { merge: true });
      } catch (err) {
        console.warn("Could not set runner availability to true:", err);
      }
      
      // Guest fallback if current user is one of the runners
      if (!auth.currentUser && runnerId === userProfile.id) {
        syncProfile({
          ...userProfile,
          isAvailable: true
        });
      }
    });

    // Generate Hunter Review
    const finalRating = rating || 5;
    const finalComment = comment || (userProfile && userProfile.lang === 'ar' ? 'عمل ممتاز وسريع للغاية! شكراً جزيلاً.' : 'Excellent work, fast and professional! Highly recommended.');
    const helperId = targetQuest.helperId || 'leader-1';
    const helperName = targetQuest.helperName || 'رشيد بن علي';

    const newReview: HunterReview = {
      reviewId: `rev-${questId}`,
      hunterId: helperId,
      godfatherId: userProfile?.id || 'user-current',
      godfatherName: userProfile?.name || 'صاحب العمل',
      godfatherAvatar: userProfile?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
      completedTaskImage: targetQuest.proofImageUrl || (targetQuest.imageUrls && targetQuest.imageUrls[0]) || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80',
      rating: finalRating,
      comment: finalComment,
      createdAt: 'الآن بالذات'
    };

    const updatedReviews = [newReview, ...hunterReviews];
    syncHunterReviews(updatedReviews);

    // Recalculate average rating of the helper if helper is current user
    if (helperId === userProfile?.id) {
      const myReviews = updatedReviews.filter(r => r.hunterId === userProfile.id);
      const averageRating = myReviews.reduce((sum, r) => sum + r.rating, 0) / myReviews.length;
      
      // Update profile with finished quest
      // Shift primary XP from static tasks to active Quest completion expenditures: Multiply booking fee tokens * 3
      const questTokensCost = targetQuest.bookingFeeTokens || targetQuest.requiredTokens || Math.max(50, Math.round((targetQuest.cashReward || 1000) * 0.10));
      const dynamicXPReward = questTokensCost * 3;
      const updatedPoints = userProfile.totalPoints + dynamicXPReward;
      const updatedCompletedQuestsCount = userProfile.questsCompleted + 1;
      const calculatedLevel = calculateLevelForPoints(updatedPoints);

      const storedCompletedIds = [...userProfile.completedQuestsIds];
      if (!storedCompletedIds.includes(questId)) {
        storedCompletedIds.push(questId);
      }

      const unlockedBadgeIds = [...userProfile.unlockedBadgeIds];
      if (updatedCompletedQuestsCount >= 5 && !unlockedBadgeIds.includes('badge-hero-neighborhood')) {
        unlockedBadgeIds.push('badge-hero-neighborhood');
      }
      if (targetQuest.urgency === 'urgent' && !unlockedBadgeIds.includes('badge-speedster')) {
        unlockedBadgeIds.push('badge-speedster');
      }

      syncProfile({
        ...userProfile,
        rating: Number(averageRating.toFixed(1)),
        totalPoints: updatedPoints,
        questsCompleted: updatedCompletedQuestsCount,
        level: calculatedLevel,
        completedQuestsIds: storedCompletedIds,
        unlockedBadgeIds
      });
    } else {
      // If mock leader was the helper, raise their score and average rating too!
      const updatedLeaders = leaders.map(leader => {
        if (leader.id === helperId) {
          const leaderReviews = updatedReviews.filter(r => r.hunterId === helperId);
          const averageRating = leaderReviews.reduce((sum, r) => sum + r.rating, 0) / leaderReviews.length;
          return {
            ...leader,
            points: leader.points + targetQuest.pointsReward,
            questsCompleted: leader.questsCompleted + 1,
            rating: Number(averageRating.toFixed(1))
          };
        }
        return leader;
      });
      setLeaders(updatedLeaders);
      localStorage.setItem('quest_app_leaders', JSON.stringify(updatedLeaders));
      showToast(`🏆 تم تأكيد تسليم العمل! تم إنشاء "مراجعة بورتفوليو" للعامل [${targetQuest.helperName}].`);
    }
  };

  // Callback 3: Post a brand new local quest - NOW PROTECTED BY HARDWARE GPS
  const handlePostNewQuest = (newQuestData: Partial<Quest>) => {
    verifyGpsHardwareAndExecute('publish', newQuestData, (coords) => {
      const newQuest: Quest = {
        id: `q-user-${Date.now()}`,
        title: newQuestData.title || '',
        description: newQuestData.description || '',
        location: newQuestData.location || '',
        lat: coords.lat,
        lng: coords.lng,
        category: newQuestData.category || 'أخرى',
        cashReward: newQuestData.cashReward || 50,
        pointsReward: newQuestData.pointsReward || 150,
        bookingFeeTokens: Math.max(50, Math.ceil((newQuestData.cashReward || 1000) * 0.10)),
        urgency: newQuestData.urgency || 'normal',
        createdAt: new Date().toISOString(),
        status: 'open',
        flagsCount: 0,
        flaggers: [],
        creatorId: userProfile.id,
        creatorName: userProfile.name,
        creatorPhone: userProfile.phone,
        creatorAvatar: userProfile.avatar,
        imageUrls: newQuestData.imageUrls,
        images: newQuestData.images,
        imageUrl: newQuestData.imageUrl,
      };

      const updatedQuests = [newQuest, ...quests];
      syncQuests(updatedQuests);

      // Update Profile statistics for created list
      const updatedCreatedList = [...userProfile.createdQuestsIds, newQuest.id];
      syncProfile({
        ...userProfile,
        questsCreated: userProfile.questsCreated + 1,
        createdQuestsIds: updatedCreatedList,
      });

      showToast(userProfile?.language === 'ar'
        ? '🚀 كويست منشور بنجاح! تم التقاط موقع GPS الخاص بك وتعميم المهمة على الرانرز المحيطين بك.'
        : '🚀 Quest published successfully! Your validated hardware GPS coordinates have been broadcast to runners around you.'
      );
    });
  };

  // Callback 4: Delete a created Quest (if still available)
  const handleDeleteCreatedQuest = async (questId: string) => {
    const targetQuest = quests.find(q => q.id === questId);
    if (!targetQuest) return;

    // No refund amount to prevent free-token exploits since creation did not deduct tokens
    const refundAmount = 0;

    const updatedQuests = quests.filter(q => q.id !== questId);
    syncQuests(updatedQuests, questId);

    // Atomic database update directly into owner's balance
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          tokenBalance: userProfile.tokenBalance,
          tokens: (userProfile as any).tokens || userProfile.tokenBalance
        }, { merge: true });
      } catch (err) {
        console.warn("Could not set user in DB:", err);
      }
    }

    syncProfile({
      ...userProfile,
      questsCreated: Math.max(0, userProfile.questsCreated - 1),
      createdQuestsIds: userProfile.createdQuestsIds.filter(id => id !== questId),
      tokenBalance: userProfile.tokenBalance,
      tokens: (userProfile as any).tokens || userProfile.tokenBalance
    } as any);

    showToast(userProfile.language === 'ar' ? 'تم سحب وإلغاء المنشور بنجاح ✅' : 'The post has been successfully withdrawn and cancelled ✅');
  };

  // Emergency Contract Bypass for Owner
  const handleForceReleaseContract = async (questId: string) => {
    if (!userProfile) return;
    const targetQuest = quests.find(q => q.id === questId);
    if (!targetQuest) return;

    // 1. Change quest status to cancelled
    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        return {
          ...q,
          status: 'cancelled' as const
        };
      }
      return q;
    });
    syncQuests(updatedQuests);

    // 2. Unlock the owner's publishing lock on the profile both locally and in Firestore (tokenless!)
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          hasActiveQuest: false
        }, { merge: true });
      } catch (err) {
        console.warn("Error updating owner profile:", err);
      }
    }
    syncProfile({
      ...userProfile,
      hasActiveQuest: false
    });

    // 3. Reset runner availability
    const runnerId = targetQuest.helperId || targetQuest.assignedRunnerId || (targetQuest.assignedRunnerIds && targetQuest.assignedRunnerIds[0]);
    if (runnerId) {
      try {
        await setDoc(doc(db, 'users', runnerId), { isAvailable: true }, { merge: true });
      } catch (err) {
        console.warn("Could not reset companion availability:", err);
      }
    }

    showToast(userProfile.language === 'ar'
      ? '🚨 تم إلغاء العقد وتحرير حسابك من الحظر بنجاح!'
      : '🚨 Contract has been force released! Locked state cleared from your account!'
    );
  };

  // Callback 5: Edit Quest
  const handleEditQuest = (questId: string, updatedFields: Partial<Quest>) => {
    const updatedQuests = quests.map(q => {
      if (q.id === questId) {
        return { ...q, ...updatedFields } as Quest;
      }
      return q;
    });
    syncQuests(updatedQuests);
    showToast('تم تحديث وحفظ تفاصيل الكويست.');
  };

  // Callback 6: Claim challenge reward points
  const handleClaimChallengePoints = (challengeId: string, reward: number) => {
    const updatedPoints = userProfile.totalPoints + reward;
    const calculatedLevel = calculateLevelForPoints(updatedPoints);

    syncProfile({
      ...userProfile,
      totalPoints: updatedPoints,
      level: calculatedLevel,
    });
  };

  // Callback 7: Buy/Unlock Badge with points
  const handleUnlockBadgeInProfile = (badgeId: string, cost: number) => {
    const unlockedBadgeIds = [...userProfile.unlockedBadgeIds];
    if (!unlockedBadgeIds.includes(badgeId)) {
      unlockedBadgeIds.push(badgeId);
    }

    syncProfile({
      ...userProfile,
      totalPoints: Math.max(0, userProfile.totalPoints - cost),
      unlockedBadgeIds,
    });

    // Update locked status in global badges list
    const updatedBadges = badges.map(b => b.id === badgeId ? { ...b, unlocked: true } : b);
    syncBadges(updatedBadges);
  };

  // Profile Edit updates
  const handleUpdateProfile = (updatedFields: Partial<UserProfile>) => {
    syncProfile({
      ...userProfile,
      ...updatedFields
    });
    showToast('تم حفظ وحفظ بيانات الحساب والإشعارات بنجاح!');
  };

  // Token Refill Top-up simulation
  const handleTopUpTokens = (amount: number) => {
    if (!userProfile) return;
    syncProfile({
      ...userProfile,
      tokenBalance: userProfile.tokenBalance + amount
    });
  };

  // KYC submission simulation
  const handleSubmitKyc = (fullName: string, nidNum: string, customStatus?: 'verified' | 'pending') => {
    if (!userProfile) return;
    const isApproved = customStatus === 'verified';
    const rewardAmount = isApproved ? 700 : 0;
    
    syncProfile({
      ...userProfile,
      idVerificationStatus: customStatus || 'pending',
      idDocumentUrl: 'national_id_card.png',
      tokenBalance: userProfile.tokenBalance + rewardAmount
    });
  };

  // Admin: Approve user KYC documentation
  const handleApproveKYC = (userId: string) => {
    if (userId === 'user-current' || (userProfile && userId === userProfile.id)) {
      if (!userProfile) return;
      const updatedBadges = userProfile.unlockedBadgeIds.includes('badge-certified-runner')
        ? userProfile.unlockedBadgeIds
        : [...userProfile.unlockedBadgeIds, 'badge-certified-runner'];
      
      const alreadyClaimed = userProfile.kycRewardClaimed === true;
      const rewardAmount = alreadyClaimed ? 0 : 700;

      syncProfile({
        ...userProfile,
        idVerificationStatus: 'verified',
        tokenBalance: userProfile.tokenBalance + rewardAmount,
        kycRewardClaimed: true,
        unlockedBadgeIds: updatedBadges,
      });
      if (!alreadyClaimed) {
        showToast('Approved user KYC identity! Extra 700 Quest Tokens bonus & Verified Badge unlocked successfully! ⚡🛡️');
      } else {
        showToast('Approved user KYC identity! Verified Badge unlocked successfully! 🛡️');
      }
    } else {
      const updatedLeaders = leaders.map(leader => {
        if (leader.id === userId) {
          const alreadyClaimed = (leader as any).kycRewardClaimed === true;
          const rewardAmount = alreadyClaimed ? 0 : 700;
          return {
            ...leader,
            idVerificationStatus: 'verified' as const,
            kycRewardClaimed: true,
            tokenBalance: (leader.tokenBalance || 0) + rewardAmount
          };
        }
        return leader;
      });
      setLeaders(updatedLeaders);
      localStorage.setItem('quest_app_leaders', JSON.stringify(updatedLeaders));
      showToast('Approved operator KYC identity verified badge!');
    }
  };

  // Admin: Reject user KYC card
  const handleRejectKYC = (userId: string) => {
    if (userId === 'user-current') {
      if (!userProfile) return;
      syncProfile({
        ...userProfile,
        idVerificationStatus: 'unverified'
      });
      showToast('Rejected KYC application info.');
    } else {
      const updatedLeaders = leaders.map(leader => {
        if (leader.id === userId) {
          return {
            ...leader,
            idVerificationStatus: 'unverified' as const
          };
        }
        return leader;
      });
      setLeaders(updatedLeaders);
      localStorage.setItem('quest_app_leaders', JSON.stringify(updatedLeaders));
      showToast('Rejected operator KYC application.');
    }
  };

  // Admin: Ban/Freeze user
  const handleBanUser = (userId: string, isBanned: boolean) => {
    const updatedLeaders = leaders.map(leader => {
      if (leader.id === userId) {
        return {
          ...leader,
          isBanned: isBanned
        };
      }
      return leader;
    });
    setLeaders(updatedLeaders);
    localStorage.setItem('quest_app_leaders', JSON.stringify(updatedLeaders));
    showToast(isBanned ? 'Operator profile has been frozen locked!' : 'Operator profile has been unbanned.');
  };

  // Admin: Delete/moderate post
  const handleDeleteQuest = (questId: string) => {
    const updatedQuests = quests.filter(q => q.id !== questId);
    syncQuests(updatedQuests);
    showToast('Post removed from community feed database successfully.');
  };

  const handleReportUser = (targetUserId: string, reason: string) => {
    const updatedFlags = {
      ...userFlags,
      [targetUserId]: (userFlags[targetUserId] || 0) + 1
    };
    setUserFlags(updatedFlags);
    localStorage.setItem('quest_app_user_flags', JSON.stringify(updatedFlags));

    // Also sync and ban on leaders list if flags >= 3
    if (updatedFlags[targetUserId] >= 3) {
      const updatedLeaders = leaders.map(leader => {
        if (leader.id === targetUserId) {
          return {
            ...leader,
            isBanned: true
          };
        }
        return leader;
      });
      setLeaders(updatedLeaders);
      localStorage.setItem('quest_app_leaders', JSON.stringify(updatedLeaders));
      showToast(userProfile?.language === 'ar' 
        ? '🚨 تم تجميد حساب هذا العضو تماماً بموجب درع الأمان لتجاوزه ٣ بلاغات احتيال بالمنصة الوطنية!'
        : '🚨 This user profile has been frozen locked by the Scam Shield after receiving 3 community flags!'
      );
    } else {
      showToast(userProfile?.language === 'ar'
        ? `📥 تم تسجيل بلاغك بنجاح! هذا العضو يملك الآن ${updatedFlags[targetUserId]} بلاغات.`
        : `📥 Report filed successfully. This user now has ${updatedFlags[targetUserId]} community flags.`
      );
    }
  };

  const handleBroadcastMessage = (msg: string) => {
    setGlobalBroadcast(msg);
  };

  // Companion Competitor activity simulator!
  const handleSimulateCompetitorActivity = () => {
    // Choose random leader other than user and raise their points
    const nonUserLeaders = leaders.filter(l => l.id !== 'user-current' && !l.isCurrentUser);
    if (nonUserLeaders.length === 0) return;

    const luckyCompetitor = nonUserLeaders[Math.floor(Math.random() * nonUserLeaders.length)];
    const scoreAdd = 50 + Math.round(Math.random() * 80);

    const updatedLeaders = leaders.map(leader => {
      if (leader.id === luckyCompetitor.id) {
        return {
          ...leader,
          points: leader.points + scoreAdd,
          questsCompleted: leader.questsCompleted + 1,
        };
      }
      return leader;
    });

    setLeaders(updatedLeaders);
    localStorage.setItem('quest_app_leaders', JSON.stringify(updatedLeaders));

    showToast(`⚡ تحديث حي: أنجز منافسك [${luckyCompetitor.name}] كويستاً جديداً وباشر مكاسبه بـ +${scoreAdd} نقطة!`);
  };

  // Match active challenges that have reached their target but haven't been claimed yet
  const unclaimedChallengesCount = challenges.filter(ch => ch.currentCount >= ch.targetCount).length;
  // Ongoing quests in which the user is helping
  const unreadTasksCount = quests.filter(q => q.helperId === userProfile.id && q.status === 'ongoing').length;

  // Real-time badge counts for Notification Center and Chat Inbox
  const unreadNotificationsCount = notifications.filter(n => !n.read).length;
  const unreadChatsCount = userChats.filter(chat => {
    const messages = chat.messages || [];
    if (messages.length === 0) return false;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.senderId === (userProfile?.id || 'guest')) return false;
    const readBy = chat.readBy || [];
    return !readBy.includes(userProfile?.id || 'guest');
  }).length;

  const getCleanEmail = (emailStr?: string) => (emailStr || '').trim().toLowerCase();
  const isAdminUser = !!(
    getCleanEmail(authenticatedUser?.email) === 'hakerzoldyck@gmail.com' ||
    authenticatedUser?.role === 'admin' ||
    getCleanEmail(userProfile?.email) === 'hakerzoldyck@gmail.com' ||
    userProfile?.role === 'admin' ||
    userProfile?.isAdmin === true
  );

  const handleOpenArrivalChat = async () => {
    if (!activeArrivalAlert) return;
    const alertId = activeArrivalAlert.id;
    const qId = activeArrivalAlert.questId;
    
    setActiveArrivalAlert(null);

    if (auth.currentUser) {
      try {
        const ref = doc(db, 'notifications', alertId);
        await updateDoc(ref, { read: true });
      } catch (err) {
        console.error("Error marking arrival notification read:", err);
      }
    }

    if (qId) {
      const q = quests.find(item => item.id === qId);
      if (q) {
        const helperId = q.helperId || q.assignedRunnerId || "";
        const helperAvatar = q.applicants?.find(app => app.userId === helperId)?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';
        setDeferredActiveChat({
          chatId: `${q.id}_${q.creatorId}_${helperId}`,
          questTitle: q.title,
          recipientName: q.helperName || (userProfile?.language === 'ar' ? 'منفذ المهمة 🏃' : 'Captain 🏃'),
          recipientAvatar: helperAvatar
        });
        
        setMyQuestsActiveTab('created');
        setCurrentView('my-quests');
      }
    }
  };

  const handleDismissArrivalAlert = async () => {
    if (!activeArrivalAlert) return;
    const alertId = activeArrivalAlert.id;
    setActiveArrivalAlert(null);
    
    if (auth.currentUser) {
      try {
        const ref = doc(db, 'notifications', alertId);
        await updateDoc(ref, { read: true });
      } catch (err) {
        console.error("Error marking arrival notification read:", err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans antialiased relative">
      
      {/* Toast alert popup indicator */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-20 right-4 left-4 md:right-8 md:left-8 z-50 bg-slate-900/95 backdrop-blur-xs border border-emerald-500 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between text-xs font-bold leading-relaxed shadow-emerald-950/20"
          >
            <div className="flex-1 text-center md:text-right">
              {toastMessage}
            </div>
            <button 
              onClick={() => setToastMessage(null)}
              className="px-2 text-[10px] text-gray-400 hover:text-white font-extrabold mr-3 cursor-pointer"
            >
              إغلاق
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time Notification Center Slide-over Overlay */}
      <AnimatePresence>
        {showNotifications && (
          <NotificationScreen 
            notifications={notifications}
            onClose={() => setShowNotifications(false)}
            onViewQuest={(questId) => {
              setShowNotifications(false);
              if (questId) {
                const questToNav = quests.find(q => q.id === questId);
                if (questToNav && userProfile) {
                  const isCreator = questToNav.creatorId === userProfile.id;
                  if (isCreator) {
                    setMyQuestsActiveTab('created');
                    setCurrentView('my-quests');
                  } else {
                    setMyQuestsActiveTab('obligations');
                    setCurrentView('my-quests');
                  }
                  navigateToQuestDetail(questId);
                }
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Global Message/Chat Inbox Slide-over Overlay */}
      <AnimatePresence>
        {showInbox && userProfile && (
          <InboxScreen 
            userChats={userChats}
            quests={quests}
            onClose={() => setShowInbox(false)}
            currentUserId={userProfile.id}
            lang={userProfile.language}
            onOpenChat={(chatId) => {
              setShowInbox(false);
              const openChatEvent = new CustomEvent('open-chat', {
                detail: {
                  chatId,
                  questId: chatId.split('_')[0]
                }
              });
              window.dispatchEvent(openChatEvent);
              setCurrentView('my-quests');
            }}
          />
        )}
      </AnimatePresence>

      {/* Dynamic Member Profile Inspection Full Screen View */}
      <AnimatePresence>
        {selectedPublicProfileId && (
          <motion.div 
            id="public-profile-backdrop"
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 250 }}
            className="fixed inset-0 bg-slate-50 z-[120] overflow-y-auto flex flex-col"
          >
            <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:px-6 md:py-10 flex-1 flex flex-col">
              <div className="bg-white border border-gray-100/80 rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-xl shadow-slate-100/50 flex-1 flex flex-col">
                <PublicProfileView 
                  userId={selectedPublicProfileId}
                  currentUser={userProfile}
                  leaders={leaders}
                  quests={quests}
                  hunterReviews={hunterReviews}
                  godfatherReviews={godfatherReviews}
                  lang={userProfile?.language || 'ar'}
                  onReportUser={handleReportUser}
                  onClose={() => setSelectedPublicProfileId(null)}
                  showToast={showToast}
                  userFlags={userFlags}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky Global Broadcast bulletin and announcement stream */}
      {globalBroadcast && (
        <div className="fixed top-16 right-0 left-0 bg-slate-100 border-b border-gray-200 py-2.5 px-4 z-30 flex items-center justify-between text-[11px] font-extrabold text-[#1F2A44] leading-relaxed shadow-sm">
          <span className="flex-1 text-[#1F2A44] truncate">{globalBroadcast}</span>
          <button 
            onClick={() => setGlobalBroadcast(null)}
            className="text-[#FF3B7C] hover:text-[#FF3B7C]/80 px-2 font-black shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Bottom aligned navigation frame */}
      <Navbar 
        currentView={currentView}
        onViewChange={(view) => {
          setShowNotifications(false);
          setShowInbox(false);
          setSelectedPublicProfileId(null);
          setGlobalQuestDetailId(null);
          handleViewNavigation(view);
        }}
        unclaimedChallengesCount={unclaimedChallengesCount}
        unreadTasksCount={unreadTasksCount}
        tokenBalance={userProfile.tokenBalance}
        lang={userProfile.language}
        isAdmin={isAdminUser}
        audioEnabled={userProfile.audioEffectsEnabled !== false}
        unreadNotificationsCount={unreadNotificationsCount}
        unreadChatsCount={unreadChatsCount}
        onBellClick={() => {
          setShowNotifications(prev => !prev);
          setShowInbox(false);
          setSelectedPublicProfileId(null);
          setGlobalQuestDetailId(null);
        }}
        onInboxClick={() => {
          setShowInbox(prev => !prev);
          setShowNotifications(false);
          setSelectedPublicProfileId(null);
          setGlobalQuestDetailId(null);
        }}
        userProfile={userProfile}
        quests={quests}
        notifications={notifications}
      />

      {/* Main Scroll Content Area */}
      <main className="max-w-5xl mx-auto px-4 md:px-8 pt-28 pb-28 md:pb-32">
        <h2 className="sr-only">محتوى صفحة كويست الرئيسي</h2>
        <AnimatePresence mode="wait">
          <motion.div
            key={globalQuestDetailId ? `quest-detail-${globalQuestDetailId}` : currentView}
            initial={{ 
              opacity: 0, 
              x: globalQuestDetailId ? (userProfile?.language === 'ar' ? -50 : 50) : 0, 
              y: globalQuestDetailId ? 0 : 12 
            }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ 
              opacity: 0, 
              x: globalQuestDetailId ? (userProfile?.language === 'ar' ? 50 : -50) : 0, 
              y: globalQuestDetailId ? 0 : -12 
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* View Switching logic with dynamic stack-based router */}
            {globalQuestDetailId ? (
              <QuestDetailScreen
                questId={globalQuestDetailId}
                quests={quests}
                userProfile={userProfile!}
                userLoc={userLoc}
                onBack={navigateBack}
                onBookQuest={(questId, tokenFee) => {
                  handleBookQuest(questId, tokenFee);
                }}
                onStartNavigation={(q) => {
                  setNavigatingQuest(q);
                  // Open in map with detail view popped
                  handleViewNavigation('map');
                  setGlobalQuestDetailId(null);
                }}
                onOpenChat={(chatParams) => {
                  const openChatEvent = new CustomEvent('open-chat', {
                    detail: chatParams
                  });
                  window.dispatchEvent(openChatEvent);
                  setCurrentView('my-quests');
                  setGlobalQuestDetailId(null);
                }}
                onManageQuest={(questId) => {
                  setMyQuestsActiveTab('created');
                  setInitialSelectedQuestId(questId);
                  setCurrentView('my-quests');
                  setGlobalQuestDetailId(null);
                }}
                onViewPublicProfile={(userId) => setSelectedPublicProfileId(userId)}
                onExtendPendingQuest={handleExtendPendingQuest}
                onExtendActiveContract={handleExtendActiveContract}
                showToast={showToast}
              />
            ) : (
              <>
                {currentView === 'home' && (
                  <HomeView 
                    quests={quests}
                    userProfile={userProfile}
                    lang={userProfile.language}
                    onBookQuest={handleBookQuest}
                    onFlagQuest={handleFlagQuest}
                    showToast={showToast}
                    onViewPublicProfile={setSelectedPublicProfileId}
                    setQuests={syncQuests}
                    initialSelectedQuestId={initialSelectedQuestId}
                    onClearInitialSelectedQuest={() => setInitialSelectedQuestId(null)}
                    onViewQuestDetail={navigateToQuestDetail}
                    onUpdateProfile={syncProfile}
                    onTriggerCreateQuest={() => {
                      setCurrentView('my-quests');
                      setAutoOpenCreateQuest(true);
                    }}
                  />
                )}

                {currentView === 'map' && (
                  <MapView 
                    quests={quests}
                    userProfile={userProfile}
                    lang={userProfile.language}
                    onBookQuest={handleBookQuest}
                    showToast={showToast}
                    navigatingQuest={navigatingQuest}
                    setNavigatingQuest={setNavigatingQuest}
                    onArrivedAtQuest={handleArrivedAtQuest}
                    onViewQuestDetail={navigateToQuestDetail}
                    onManageQuest={(questId) => {
                      setMyQuestsActiveTab('created');
                      setInitialSelectedQuestId(questId);
                      setCurrentView('my-quests');
                      setGlobalQuestDetailId(null);
                    }}
                    onExtendPendingQuest={handleExtendPendingQuest}
                    onExtendActiveContract={handleExtendActiveContract}
                  />
                )}

                {currentView === 'leaderboard' && (
                  <LeaderboardView 
                    leaders={leaders}
                    challenges={challenges}
                    badges={badges}
                    userProfile={userProfile}
                    lang={userProfile.language}
                    onUnlockBadge={handleUnlockBadgeInProfile}
                    onClaimChallengePoints={handleClaimChallengePoints}
                    onSimulateActivity={handleSimulateCompetitorActivity}
                    onUpdateProfile={syncProfile}
                  />
                )}

                {currentView === 'my-quests' && (
                  <MyQuestsView 
                    quests={quests}
                    currentUserId={userProfile.id}
                    userProfile={userProfile}
                    lang={userProfile.language}
                    onPostNewQuest={handlePostNewQuest}
                    onDeleteCreatedQuest={handleDeleteCreatedQuest}
                    onCancelBookedQuest={handleCancelBookedQuest}
                    onUploadProof={handleUploadProof}
                    onConfirmPayout={handleConfirmPayout}
                    onAcceptApplicant={handleAcceptApplicant}
                    onForceReleaseContract={handleForceReleaseContract}
                    onViewPublicProfile={(userId) => setSelectedPublicProfileId(userId)}
                    deferredActiveChat={deferredActiveChat}
                    onClearDeferredChat={() => setDeferredActiveChat(null)}
                    initialTab={myQuestsActiveTab}
                    onClearInitialTab={() => setMyQuestsActiveTab(null)}
                    onViewQuestDetail={navigateToQuestDetail}
                    initialSelectedQuestId={initialSelectedQuestId}
                    onClearInitialSelectedQuest={() => setInitialSelectedQuestId(null)}
                    onSendPushNotification={sendPushNotification}
                    autoOpenCreate={autoOpenCreateQuest}
                    onClearAutoOpenCreate={() => setAutoOpenCreateQuest(false)}
                  />
                )}

                {currentView === 'profile' && (
                  <ProfileView 
                    userProfile={userProfile}
                    badges={badges}
                    lang={userProfile.language}
                    onUpdateProfile={handleUpdateProfile}
                    onTopUpTokens={handleTopUpTokens}
                    onSubmitKYC={handleSubmitKyc}
                    showToast={showToast}
                    hunterReviews={hunterReviews}
                    godfatherReviews={godfatherReviews}
                    onDeleteReview={handleDeleteHunterReview}
                    authenticatedUser={authenticatedUser}
                    onSignInWithGoogle={handleSignInWithGoogle}
                    onSignOut={handleSignOut}
                    onViewChange={setCurrentView}
                  />
                )}

                {currentView === 'admin' && (
                  isAdminUser ? (
                    <AdminView 
                      userProfile={userProfile}
                      quests={quests}
                      leaders={leaders}
                      lang={userProfile.language}
                      onApproveKYC={handleApproveKYC}
                      onRejectKYC={handleRejectKYC}
                      onBanUser={handleBanUser}
                      onDeleteQuest={handleDeleteQuest}
                      onBroadcastMessage={handleBroadcastMessage}
                      showToast={showToast}
                      onInspectQuest={(questId) => setGlobalQuestDetailId(questId)}
                    />
                  ) : (
                    <div className="bg-white border-2 border-red-500 rounded-3xl p-8 text-center space-y-4 shadow-md max-w-md mx-auto my-12 font-sans" style={{ direction: userProfile.language === 'ar' ? 'rtl' : 'ltr' }}>
                      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                        <span className="text-red-600 text-3xl">⚠️</span>
                      </div>
                      <h3 className="text-lg font-black text-red-600">غير مصرح بالدخول | Access Denied</h3>
                      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                        هذه الصفحة مخصصة للمشرفين فقط. يرجى تسجيل الدخول بحساب مشرف معتمد للوصول للميزات الإدارية.
                      </p>
                    </div>
                  )
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {/* Pre-flight Balance Fee Check Warning / KYC Incentives Prompt Modal */}
        {showKycRefillPromptModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[12000]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-150 text-right space-y-4"
              style={{ direction: userProfile?.language === 'ar' ? 'rtl' : 'ltr' }}
            >
              <div className="flex justify-center">
                <div className="p-3.5 bg-amber-50 text-amber-500 rounded-3xl animate-pulse text-center flex items-center justify-center">
                  <span className="text-3xl">⚠️</span>
                </div>
              </div>

              <h3 className="text-sm font-black text-slate-800 text-center">
                {userProfile?.language === 'ar' 
                  ? 'رصيد الرموز غير كافٍ لحجز العقد! ⚖️' 
                  : 'Insufficient Token Balance to Reserve Contract'}
              </h3>

              <div className="space-y-3">
                <p className="text-[11px] text-gray-500 leading-relaxed font-bold text-center">
                  {userProfile?.language === 'ar'
                    ? `رصيدك الحالي هو (${userProfile?.tokenBalance || 0} توكن)، بينما تبلغ «رسوم التحقق والضمان وحماية المنصة» لهذه المهمة (${requiredRefillFee} توكن) لضمان التزام معايير متجر Google Play لمنع الاحتيال.`
                    : `Your token balance is (${userProfile?.tokenBalance || 0} tokens), whereas the «Platform guarantee & validation safety fee» is (${requiredRefillFee} tokens) to satisfy dynamic Google Play data integrity conditions.`}
                </p>

                <p className="text-[11px] text-[#4FC3F7] font-extrabold bg-[#4FC3F7]/5 p-3 rounded-2xl border border-[#4FC3F7]/20 text-center leading-relaxed">
                  {userProfile?.language === 'ar'
                    ? '💡 نصيحة مجانية: يمكنك توثيق هويتك (KYC) فوراً لكسب 700 توكن مجانية، أو شحن محفظتك مباشرة لتأمين المهمة.'
                    : '💡 Smart Tip: Verify your identity (KYC) for free to earn +700 welcome tokens immediately, or add tokens to your wallet.'}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowKycRefillPromptModal(false);
                    setCurrentView('profile');
                  }}
                  className="w-full py-2.5 bg-[#4FC3F7] hover:bg-[#4FC3F7]/85 text-white font-black text-xs rounded-xl shadow-md cursor-pointer text-center"
                >
                  {userProfile?.language === 'ar' ? '🛡️ توثيق هويتي الآن مجاناً (+700)' : '🛡️ Verify Identity for Free (+700)'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowKycRefillPromptModal(false);
                    setCurrentView('profile');
                  }}
                  className="w-full py-2.5 bg-[#1F2A44] hover:bg-[#1E2E4E] text-white font-black text-xs rounded-xl shadow-md cursor-pointer text-center"
                >
                  {userProfile?.language === 'ar' ? '💳 شحن رصيد المحفظة بالتوكنز' : '💳 Top Up Wallet Tokens'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowKycRefillPromptModal(false)}
                  className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 font-extrabold text-[11px] rounded-xl cursor-pointer text-center"
                >
                  {userProfile?.language === 'ar' ? 'إغلاق النافذة' : 'Close Notification'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* Rule 5: Explanatory UX Dialog on first action */}
        {showGpsExplainDialog && (
          <div className="fixed inset-0 bg-[#1F2A44]/80 backdrop-blur-md flex items-center justify-center p-4 z-[11000]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-150 text-right space-y-4 font-sans"
              style={{ direction: userProfile?.language === 'ar' ? 'rtl' : 'ltr' }}
            >
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shadow-inner">
                <span className="text-2xl">⏳</span>
              </div>

              <h3 className="text-base font-black text-gray-900 leading-tight">
                {userProfile?.language === 'ar' ? 'التحقق الميداني الآمن 🛡️' : 'Field GPS Request 🛡️'}
              </h3>

              <p className="text-xs text-slate-700 font-extrabold leading-relaxed">
                {userProfile?.language === 'ar'
                  ? 'يتطلب تطبيق كويست الوصول إلى موقعك الدقيق الآن لضمان مصداقية التنفيذ الميداني للمهمة.'
                  : 'Quest requires access to your precise location right now to guarantee the credibility of the field execution of this task.'}
              </p>

              <div className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-[10.5px] text-gray-500 font-medium leading-relaxed">
                {userProfile?.language === 'ar'
                  ? 'تطبيق كويست يعتمد على نظام التفعيل الميكانيكي الفوري (On-Demand). نحن لا نتتبع موقعك في الخلفية مطلقاً، بل نطلب تصريح GPS مؤقت فقط عند لحظة النشر أو الحجز لضمان المصداقية ومنع التلاعب.'
                  : 'Quest uses strict Action-Triggered physical authorization on demand. We NEVER monitor your location in the background. Temporary foreground access is requested solely to guarantee actual field execution.'}
              </div>

              {/* Secure Developer Emulator Toggle */}
              <div className="pt-2 pb-1 border-t border-gray-100 flex items-center gap-2 justify-start">
                <input
                  type="checkbox"
                  id="simulate_mock_field"
                  defaultChecked={localStorage.getItem('simulate_mock_gps') === 'true'}
                  onChange={(e) => {
                    localStorage.setItem('simulate_mock_gps', e.target.checked ? 'true' : 'false');
                    showToast(userProfile?.language === 'ar' 
                      ? `⚠️ تم ${e.target.checked ? 'تفعيل' : 'إبطال'} محاكاة تزوير الموقع الجغرافي (Fake GPS)`
                      : `⚠️ Fake GPS Simulation ${e.target.checked ? 'enabled' : 'disabled'}`
                    );
                  }}
                  className="w-4 h-4 text-[#FF3B7C] focus:ring-[#FF3B7C] border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="simulate_mock_field" className="text-[10px] text-rose-600 font-semibold select-none cursor-pointer">
                  {userProfile?.language === 'ar' 
                    ? '🎯 محاكاة تزوير الموقع الجغرافي (اختبار كشف التلاعب - Rule 4)'
                    : '🎯 Simulate Fake GPS Spoofing app (Rule 4 check)'}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowGpsExplainDialog(false);
                    sessionStorage.setItem('gps_explain_accepted', 'true');
                    if (pendingGpsParams) {
                      pendingGpsParams.performHardwareFetch();
                    }
                  }}
                  className="w-full py-3 bg-[#1F2A44] hover:bg-[#1F2A44]/90 text-white rounded-2xl text-xs font-black shadow-md cursor-pointer select-none transition-all text-center"
                >
                  {userProfile?.language === 'ar' ? 'موافق، السماح' : 'Approve & Allow'}
                </button>
                <button
                  onClick={() => {
                    setShowGpsExplainDialog(false);
                    setPendingGpsParams(null);
                    showToast(userProfile?.language === 'ar' ? '⚠️ تم إلغاء العملية لعدم تزويد صلاحيات الموقع الدقيق.' : '⚠️ Action cancelled due to location authorization rejection.');
                  }}
                  className="w-full py-3 bg-gray-150 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-black cursor-pointer select-none transition-all text-center"
                >
                  {userProfile?.language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Rule 4: Security blocked alert modal for mock locations or disabled hardware */}
        {gpsSecurityError && (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 z-[20000]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-150 text-center space-y-4"
              style={{ direction: userProfile?.language === 'ar' ? 'rtl' : 'ltr' }}
            >
              <div className="w-16 h-16 bg-rose-50 border border-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <span className="text-3xl">🚫</span>
              </div>

              <h3 className="text-base font-black text-slate-900 leading-tight">
                {userProfile?.language === 'ar' ? 'تنبيه أمني وحماية البيانات 🛡️' : 'GPS Security Alert 🛡️'}
              </h3>

              <p className="text-xs text-rose-600 font-extrabold leading-relaxed">
                {gpsSecurityError}
              </p>

              <p className="text-[10px] text-slate-400 font-medium leading-normal">
                {userProfile?.language === 'ar'
                  ? 'تطبيق كويست يطبق معايير صارمة للتحقق اللحظي لحماية ركائز الحجز والتنفيذ الميداني ومكافحة تزوير المواقع الجغرافية (Anti-Mock GPS).'
                  : 'Quest implements strict real-time physical telemetry checks to prevent fake locations or emulators.'}
              </p>

              <div className="pt-2">
                <button
                  onClick={() => setGpsSecurityError(null)}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-md cursor-pointer select-none transition-all active:scale-95"
                >
                  {userProfile?.language === 'ar' ? 'موافق، مفهوم' : 'Understood'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {gpsAlertOpen && (
          <div className="fixed inset-0 bg-[#1F2A44]/60 backdrop-blur-md flex items-center justify-center p-4 z-[10000]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-150 text-center space-y-4 font-sans"
              style={{ direction: userProfile?.language === 'ar' ? 'rtl' : 'ltr' }}
            >
              <div className="w-16 h-16 bg-red-50 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <span className="text-3xl">📍</span>
              </div>
              
              <h3 className="text-base font-black text-gray-900 leading-tight">
                {userProfile?.language === 'ar' ? 'تحديد الموقع المباشر معطل' : 'Location Services Disabled'}
              </h3>
              
              <p className="text-xs text-slate-500 font-bold leading-relaxed font-sans">
                {userProfile?.language === 'ar'
                  ? 'الرجاء تفعيل خدمة تحديد المواقع (GPS) في جهازك لتتمكن من تصفح خريطة الكويستات والمهام المتاحة 📍'
                  : 'Please enable location services (GPS) on your device to start tracking quests and exploring nearby tasks 📍'}
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={async () => {
                    await Geolocator.openLocationSettings();
                    setGpsAlertOpen(false);
                    setCurrentView('map');
                    showToast(userProfile?.language === 'ar'
                      ? '✅ تم تفعيل خدمات GPS بنجاح! جاري تحميل الخريطة الميدانية...'
                      : '✅ GPS enabled successfully! Direct Map initialized!'
                    );
                  }}
                  className="w-full py-3 bg-[#1F2A44] hover:bg-[#1F2A44]/90 text-[#FFD34D] rounded-2xl text-xs font-black shadow-md cursor-pointer select-none transition-all"
                >
                  {userProfile?.language === 'ar' ? 'تفعيل الآن' : 'Enable Now'}
                </button>
                <button
                  onClick={() => setGpsAlertOpen(false)}
                  className="w-full py-2.5 bg-gray-100 hover:bg-gray-150 text-gray-600 rounded-2xl text-[11px] font-black cursor-pointer select-none transition-all"
                >
                  {userProfile?.language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🏁 Real-time Interactive Captain Arrival Alert Overlay */}
      <AnimatePresence>
        {activeArrivalAlert && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4 z-[30000] font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: 'spring', damping: 20 }}
              className="bg-[#1F2A44] border-2 border-[#FFD34D]/50 rounded-[2rem] p-8 max-w-sm w-full shadow-[0_0_50px_rgba(255,211,77,0.25)] relative overflow-hidden text-center space-y-6"
              style={{ direction: userProfile?.language === 'ar' ? 'rtl' : 'ltr' }}
            >
              {/* Pulsating Map Geofence Radar Animation */}
              <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                <span className="absolute inline-flex h-20 w-20 rounded-full bg-emerald-400 opacity-20 animate-ping"></span>
                <span className="absolute inline-flex h-16 w-16 rounded-full bg-emerald-500 opacity-30 animate-pulse"></span>
                <div className="relative w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-full flex items-center justify-center shadow-lg border-2 border-emerald-300">
                  <span className="text-3xl">📍</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3 py-1 bg-[#FFD34D]/15 border border-[#FFD34D]/30 rounded-full text-[10px] font-black text-[#FFD34D] uppercase tracking-wider animate-pulse font-sans">
                  {userProfile?.language === 'ar' ? 'تنبيه وصول مباشر 🏁' : 'LIVE ARRIVAL ALERT 🏁'}
                </span>
                <h3 className="text-lg font-black text-white leading-tight">
                  {userProfile?.language === 'ar' ? 'وصل الكابتن إلى موقع المهمة!' : 'Captain Arrived at Location!'}
                </h3>
                <p className="text-xs text-slate-300 font-bold leading-relaxed px-1">
                  {activeArrivalAlert.text}
                </p>
              </div>

              {/* Quest Short Details Preview Card */}
              {(() => {
                const q = quests.find(item => item.id === activeArrivalAlert.questId);
                if (!q) return null;
                return (
                  <div className="bg-[#162035] border border-slate-700/60 rounded-2xl p-4 text-right flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1F2A44] flex items-center justify-center text-xl shrink-0 border border-slate-700">
                      🏃
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] text-[#4FC3F7] font-extrabold block uppercase tracking-wider leading-none mb-1">
                        {userProfile?.language === 'ar' ? 'المهمة المرتبطة' : 'Associated Quest'}
                      </span>
                      <h4 className="text-xs font-black text-white truncate ltr:text-left text-right">
                        {q.title}
                      </h4>
                      <p className="text-[10px] text-[#FFD34D] font-black mt-0.5 ltr:text-left text-right">
                        💰 {q.cashReward} {userProfile?.language === 'ar' ? 'ر.س' : 'DA'}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  onClick={handleOpenArrivalChat}
                  className="w-full py-3.5 bg-gradient-to-r from-[#FFD34D] to-[#F1C40F] hover:from-[#FFE066] hover:to-[#F39C12] text-[#1F2A44] hover:shadow-[0_0_20px_rgba(255,211,77,0.4)] rounded-2xl text-xs font-black shadow-lg cursor-pointer select-none transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <span>💬</span>
                  <span>
                    {userProfile?.language === 'ar' ? 'تحدث مع الكابتن الآن' : 'Chat with Captain Now'}
                  </span>
                </button>
                <button
                  onClick={handleDismissArrivalAlert}
                  className="w-full py-3 bg-slate-700/50 hover:bg-slate-700/80 border border-slate-600/40 text-slate-100 rounded-2xl text-xs font-black cursor-pointer select-none transition-all transform active:scale-[0.98]"
                >
                  {userProfile?.language === 'ar' ? 'حسناً، فهمت 👍' : 'Understood, Awesome 👍'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🤝 Reciprocal Forced Rating Modal Overlay (Dual Evaluation) */}
      {!isLoadingRating && activeRatingQuestId && userProfile && (
        <ReciprocalRatingModal
          questId={activeRatingQuestId}
          quests={quests}
          userProfile={userProfile}
          onSaveHunterReview={handleSaveHunterReviewFromReciprocal}
          onSaveGodfatherReview={handleSaveGodfatherReviewFromReciprocal}
        />
      )}

    </div>
  );
}
