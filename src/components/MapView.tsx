import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Compass, 
  Search, 
  X, 
  Layers,
  Info,
  BookMarked,
  Maximize2,
  Minimize2,
  Target,
  Shield,
  Award,
  MessageSquare
} from 'lucide-react';
import { Quest, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { translations } from '../data/translations';
import { playLockAndLoadCoins, triggerHaptic } from '../utils/audio';
import UnifiedQuestCard from './UnifiedQuestCard';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Geolocator } from '../utils/geolocator';

interface MapViewProps {
  quests: Quest[];
  userProfile: UserProfile;
  lang: 'ar' | 'fr' | 'en';
  onBookQuest: (questId: string, bookingFee: number) => void;
  showToast: (msg: string) => void;
  navigatingQuest: Quest | null;
  setNavigatingQuest: (quest: Quest | null) => void;
  onArrivedAtQuest: (questId: string) => void;
  onViewQuestDetail?: (id: string) => void;
  onManageQuest?: (questId: string) => void;
  onExtendPendingQuest?: (questId: string) => void;
  onExtendActiveContract?: (questId: string) => void;
}

export default function MapView({ 
  quests, 
  userProfile, 
  lang, 
  onBookQuest, 
  showToast,
  navigatingQuest,
  setNavigatingQuest,
  onArrivedAtQuest,
  onViewQuestDetail,
  onManageQuest,
  onExtendPendingQuest,
  onExtendActiveContract
}: MapViewProps) {
  const [gpsActive, setGpsActive] = useState(true);
  const [userLoc, setUserLoc] = useState({ lat: 36.7538, lng: 3.0588 }); // Centered on Algiers capital as starting city
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [maxDistance, setMaxDistance] = useState(1200); // 1205km acts as national coverage
  const [isLocating, setIsLocating] = useState(false);
  const [simulatedDistance, setSimulatedDistance] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [navProgress, setNavProgress] = useState(0); // 0.0 to 1.0
  const [navStartLoc, setNavStartLoc] = useState({ lat: 36.7538, lng: 3.0588 });
  const [hasCenteredGPS, setHasCenteredGPS] = useState(false);
  const [showDetailedSheet, setShowDetailedSheet] = useState<Quest | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isGpsServiceEnabled, setIsGpsServiceEnabled] = useState(true);
  const [gpsDenied, setGpsDenied] = useState(false);

  // Feature 5 states
  const [travelMode, setTravelMode] = useState<'driving' | 'cycling' | 'walking'>('walking');
  const [lockedRoutePoints, setLockedRoutePoints] = useState<[number, number][]>([]);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);

  // Synchronically listen to Geolocator status shifts with low-level interval polling for real-time compliance
  useEffect(() => {
    const handleGpsSync = async () => {
      const enabled = await Geolocator.isLocationServiceEnabled();
      setIsGpsServiceEnabled(enabled);
    };
    handleGpsSync();

    // Constant 1-second interval loop checking hardware/system level GPS location services state
    const intervalId = setInterval(handleGpsSync, 1000);

    const handleGpsStatusEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.enabled === 'boolean') {
        setIsGpsServiceEnabled(detail.enabled);
      }
    };
    window.addEventListener('gps_status_changed', handleGpsStatusEvent);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('gps_status_changed', handleGpsStatusEvent);
    };
  }, []);

  // Decoupled camera state & interaction management refs to prevent resetting camera on data subscription updates
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const isUserInteractingRef = useRef(false);
  const interactionTimeoutRef = useRef<any>(null);
  const userHasMovedCameraRef = useRef(false);

  // When a quest is being navigated, trigger fullscreen automatically and initialize navigation tracking
  useEffect(() => {
    if (navigatingQuest) {
      setIsFullScreen(true);
      setNavStartLoc({ lat: userLoc.lat, lng: userLoc.lng });
      setNavProgress(0);
    }
  }, [navigatingQuest]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);

  // Calculate degree heading/angle between two coordinates
  const calculateHeadingDegree = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dy = lat2 - lat1;
    const dx = Math.cos(lat1 * Math.PI / 180) * (lng2 - lng1);
    const angleRad = Math.atan2(dx, dy);
    let angleDeg = angleRad * 180 / Math.PI;
    if (angleDeg < 0) {
      angleDeg += 360;
    }
    return Math.round(angleDeg);
  };

  // Exit Navigation handler
  const handleExitNavigation = () => {
    setNavigatingQuest(null);
    setNavProgress(0);
    setUserLoc({ lat: 36.7538, lng: 3.0588 });
    showToast(lang === 'ar' ? '🛑 تم الخروج من وضع الملاحة والرجوع للاستكشاف العادي.' : '🛑 Exited guidance mode. Returning to map explorer.');
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  const calculateDistanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371; // Earth major radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // in meters
  };

  const getDistanceToPolyline = (lat: number, lng: number, points: [number, number][]) => {
    if (!points || points.length === 0) return Infinity;
    let minDistance = Infinity;
    for (const pt of points) {
      const d = calculateDistanceMeters(lat, lng, pt[0], pt[1]);
      if (d < minDistance) {
        minDistance = d;
      }
    }
    return minDistance;
  };

  // Route locking logic: Lock route once, recalculate ONLY on travel mode toggling or if user drifts > 50 meters
  useEffect(() => {
    if (!navigatingQuest) {
      if (lockedRoutePoints.length > 0) {
        setLockedRoutePoints([]);
      }
      return;
    }

    const fetchRoutePath = async (start: { lat: number; lng: number }, end: { lat: number; lng: number }, mode: 'driving' | 'cycling' | 'walking') => {
      setIsCalculatingRoute(true);
      const osrmProfile = mode === 'walking' ? 'foot' : mode; // 'foot', 'cycling' or 'driving'
      const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&alternatives=false&geometries=geojson`;
      
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates;
          if (Array.isArray(coords) && coords.length > 0) {
            const points = coords.map((c: any) => [c[1], c[0]] as [number, number]);
            setLockedRoutePoints(points);
            return;
          }
        }
      } catch (err: any) {
        console.warn("OSRM Route fetch failure (using straight-line fallback):", err.message || err);
      } finally {
        setIsCalculatingRoute(false);
      }
    };

    if (lockedRoutePoints.length === 0) {
      // First route locking
      fetchRoutePath(userLoc, navigatingQuest, travelMode);
      return;
    }

    // Measure actual routing drift distance in meters
    const currentDrift = getDistanceToPolyline(userLoc.lat, userLoc.lng, lockedRoutePoints);

    // If drift is larger than 50 meters, trigger Route Re-calculation (Rerouting)
    if (currentDrift > 50) {
      showToast(
        lang === 'ar'
          ? `🔄 تم الانحراف عن المسار بـ ${Math.round(currentDrift)}م.. جاري جلب مسار ملاحة بديل وتثبيته!`
          : `🔄 Drifted ${Math.round(currentDrift)}m from path (>50m). Recalculating and locking fresh route!`
      );
      fetchRoutePath(userLoc, navigatingQuest, travelMode);
    }
  }, [userLoc, navigatingQuest, travelMode, lockedRoutePoints.length]);

  // Synchronize dynamic position mapping closer to target along the locked route
  useEffect(() => {
    if (navigatingQuest) {
      if (lockedRoutePoints.length > 0) {
        const totalPoints = lockedRoutePoints.length;
        const indexFloat = (totalPoints - 1) * navProgress;
        const lowerIndex = Math.floor(indexFloat);
        const upperIndex = Math.min(totalPoints - 1, Math.ceil(indexFloat));
        const factor = indexFloat - lowerIndex;
        
        const p1 = lockedRoutePoints[lowerIndex];
        const p2 = lockedRoutePoints[upperIndex];
        if (p1 && p2) {
          const lat = p1[0] + (p2[0] - p1[0]) * factor;
          const lng = p1[1] + (p2[1] - p1[1]) * factor;
          setUserLoc({ lat, lng });
        }
      } else {
        const targetLat = navigatingQuest.lat;
        const targetLng = navigatingQuest.lng;
        const currentLat = navStartLoc.lat + (targetLat - navStartLoc.lat) * navProgress;
        const currentLng = navStartLoc.lng + (targetLng - navStartLoc.lng) * navProgress;
        setUserLoc({ lat: currentLat, lng: currentLng });
      }
    }
  }, [navProgress, navigatingQuest, navStartLoc, lockedRoutePoints]);

  // Auto-resize trigger for Leaflet when toggling full-screen mode
  useEffect(() => {
    if (mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isFullScreen]);

  const dict = translations[lang];
  const isRtl = lang === 'ar';

  const activeQuests = quests.filter(q => q.status === 'open');

  const triggerGPSGet = (isManualReset = false) => {
    setIsLocating(true);
    setGpsActive(false);

    if (navigator.geolocation) {
      // Enforce physical satellite sensor directly using maximum high-accuracy setting & zero caching
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const fetchedLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLoc(fetchedLoc);
          setGpsActive(true);
          setIsLocating(false);
          setHasCenteredGPS(true);
          setGpsDenied(false);

          if (isManualReset) {
            userHasMovedCameraRef.current = false;
            setIsUserInteracting(false);
            isUserInteractingRef.current = false;
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setView([fetchedLoc.lat, fetchedLoc.lng], 13);
            }
          }
          showToast(lang === 'ar' ? '📍 تم تحديث موقعك الفعلي بنجاح عبر تتبع GPS!' : '📍 Real-time GPS location synced successfully!');
        },
        (error) => {
          console.warn("Geolocation failed or blocked", error);
          setIsLocating(false);
          
          if (error.code === error.PERMISSION_DENIED) {
            setGpsActive(false);
            setGpsDenied(true);
            showToast(lang === 'ar' ? '⚠️ يرجى تفعيل موقع الجهاز (GPS) لعرض الخريطة الميدانية' : '⚠️ Please enable device location (GPS) to view the field map');
          } else {
            // Temporary error or timeout - fall back gracefully and show the Algiers map so they can still operate!
            const fallbackLoc = { lat: 36.7538, lng: 3.0588 };
            setUserLoc(fallbackLoc);
            setGpsActive(true);
            setGpsDenied(false);
            setHasCenteredGPS(true);

            if (isManualReset && mapInstanceRef.current) {
              mapInstanceRef.current.setView([fallbackLoc.lat, fallbackLoc.lng], 13);
            }
            showToast(lang === 'ar' ? '📍 تم استخدام إحداثيات موقعك الأخير أو الافتراضي مؤقتاً.' : '📍 Temporary fallback to default map location.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0 // Force bypass of any server proxy/cached networks
        }
      );
    } else {
      setIsLocating(false);
      // Fail safely to default coordinates
      const fallbackLoc = { lat: 36.7538, lng: 3.0588 };
      setUserLoc(fallbackLoc);
      setGpsActive(true);
      setGpsDenied(false);
      setHasCenteredGPS(true);
    }
  };

  const calculateDistanceKm = (qLat: number, qLng: number) => {
    // Elegant Haversine formula calculation across all of Algeria territory
    const R = 6371; // Earth major radius in km
    const dLat = (qLat - userLoc.lat) * Math.PI / 180;
    const dLng = (qLng - userLoc.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(userLoc.lat * Math.PI / 180) * Math.cos(qLat * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = R * c;
    return parseFloat(dist.toFixed(1));
  };

  const calculateDistanceKmRaw = (qLat: number, qLng: number) => {
    const R = 6371; // Earth major radius in km
    const dLat = (qLat - userLoc.lat) * Math.PI / 180;
    const dLng = (qLng - userLoc.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(userLoc.lat * Math.PI / 180) * Math.cos(qLat * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const filteredMapQuests = activeQuests.filter(quest => {
    const km = calculateDistanceKm(quest.lat, quest.lng);
    const matchesDistance = maxDistance >= 1200 ? true : km <= maxDistance;
    const matchesSearch = searchQuery === '' || 
                          quest.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          quest.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDistance && matchesSearch;
  });

  useEffect(() => {
    if (selectedQuest) {
      const km = calculateDistanceKm(selectedQuest.lat, selectedQuest.lng);
      if (km < 1) {
        setSimulatedDistance(lang === 'ar' ? `${Math.round(km * 1000)} متر` : `${Math.round(km * 1000)} meters`);
      } else {
        setSimulatedDistance(lang === 'ar' ? `${km} كم` : `${km} km`);
      }
    } else {
      setSimulatedDistance(null);
    }
  }, [selectedQuest, userLoc]);

  // Handle Book Quest inside Map Modal or popup trigger
  const handleMapBookClick = (quest: Quest) => {
    const fee = Math.max(50, Math.round(quest.cashReward * 0.10));
    if (userProfile.tokenBalance < fee) {
      showToast(lang === 'ar' ? '⚡ رصيد غير كافٍ لدفع رسوم الحجز وضمان المنصة (10% كحد أدنى 50 توكن)' : '⚡ Insufficient token balance for booking & platform safety guarantee (10%, min 50 tokens)');
      return;
    }

    onBookQuest(quest.id, fee);
    setSelectedQuest(null);

    showToast(lang === 'ar' 
      ? '🚀 تم التقديم والطلب بنجاح! في انتظار موافقة صاحب العمل لتفعيل العقد وبدء تتبع المسار المباشر ⏳' 
      : '🚀 Applied successfully! Awaiting creator approval to activate the contract and launch active GPS routing ⏳');

    const audioEnabled = userProfile.audioEffectsEnabled !== false;
    const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
    playLockAndLoadCoins(audioEnabled);
    triggerHaptic('sharp', hapticEnabled);
  };

  // Continuous real-time tracking link (silently initiated only if already granted)
  useEffect(() => {
    let watchId: number | null = null;
    
    const trySilentWatch = async () => {
      try {
        if (!navigator.geolocation) return;
        if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
          const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (perm.state === 'granted' && isGpsServiceEnabled) {
            watchId = navigator.geolocation.watchPosition(
              (position) => {
                const fetchedLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
                setUserLoc(fetchedLoc);
                setGpsActive(true);
                setGpsDenied(false);
              },
              (error) => {
                console.warn("Continuous hardware tracking error:", error);
                if (error.code === error.PERMISSION_DENIED) {
                  setGpsActive(false);
                  setGpsDenied(true);
                }
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
        console.warn("Silent watch error:", err);
      }
    };

    trySilentWatch();

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isGpsServiceEnabled]);

  // Initialize map container once
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [34.0, 3.5], // Centered beautifully at macro national level over Algeria
        zoom: 6, // View the entire national map at startup
        zoomControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Listen to user map interactions to set flags and prevent snapping
      const handleUserInteractionStart = () => {
        setIsUserInteracting(true);
        isUserInteractingRef.current = true;
        userHasMovedCameraRef.current = true; // Flag that camera position should NOT auto-reset in background
        if (interactionTimeoutRef.current !== null) {
          window.clearTimeout(interactionTimeoutRef.current);
          interactionTimeoutRef.current = null;
        }
      };

      const handleUserInteractionEnd = () => {
        if (interactionTimeoutRef.current !== null) {
          window.clearTimeout(interactionTimeoutRef.current);
        }
        interactionTimeoutRef.current = window.setTimeout(() => {
          setIsUserInteracting(false);
          isUserInteractingRef.current = false;
        }, 5000); // Wait 5 seconds of absolute stillness
      };

      map.on('dragstart', handleUserInteractionStart);
      map.on('zoomstart', handleUserInteractionStart);
      map.on('dragend', handleUserInteractionEnd);
      map.on('zoomend', handleUserInteractionEnd);
      map.on('touchstart', handleUserInteractionStart);
      map.on('touchend', handleUserInteractionEnd);
      map.on('mousedown', handleUserInteractionStart);
      map.on('mouseup', handleUserInteractionEnd);

      mapInstanceRef.current = map;
    }

    // Rule 1 & 3: Map mounts silently without triggering location alerts. GPS queries are action-triggered.

    return () => {
      if (interactionTimeoutRef.current !== null) {
        window.clearTimeout(interactionTimeoutRef.current);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.off('dragstart');
        mapInstanceRef.current.off('zoomstart');
        mapInstanceRef.current.off('dragend');
        mapInstanceRef.current.off('zoomend');
        mapInstanceRef.current.off('touchstart');
        mapInstanceRef.current.off('touchend');
        mapInstanceRef.current.off('mousedown');
        mapInstanceRef.current.off('mouseup');
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map center smoothly when user position is updated, adapting to fit bounds if navigating
  useEffect(() => {
    if (mapInstanceRef.current) {
      if (navigatingQuest) {
        // Only run automatic fitBounds if the user isn't interacting right now
        if (!isUserInteractingRef.current) {
          const bounds = L.latLngBounds([
            [userLoc.lat, userLoc.lng],
            [navigatingQuest.lat, navigatingQuest.lng]
          ]);
          mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] });
        }
      } else if (hasCenteredGPS) {
        // ONLY auto-center/zoom if the user is NOT interacting and hasn't manually adjusted their map view
        if (!isUserInteractingRef.current && !userHasMovedCameraRef.current) {
          mapInstanceRef.current.setView([userLoc.lat, userLoc.lng], 13);
        }
      }
    }
  }, [userLoc, navigatingQuest, hasCenteredGPS]);

  // Sync markers for Active quests on database change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Purge old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Purge old navigation polyline route
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Add User Current Location pulsing radar icon
    if (gpsActive) {
      const userIcon = L.divIcon({
        className: 'user-marker-glow',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-8 h-8 bg-[#4FC3F7]/30 rounded-full animate-ping"></div>
            <div class="absolute w-16 h-16 bg-[#4FC3F7]/10 rounded-full animate-pulse"></div>
            <div class="w-4.5 h-4.5 bg-[#4FC3F7] border-2 border-white rounded-full shadow-[0_0_10px_rgba(79,195,247,0.8)]"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const userMarker = L.marker([userLoc.lat, userLoc.lng], { icon: userIcon }).addTo(map);
      markersRef.current.push(userMarker);
    }

    // Create a pulsing hot pink connection path if we are in active navigation mode
    if (navigatingQuest) {
      const plinePoints: L.LatLngExpression[] = lockedRoutePoints.length > 0
        ? lockedRoutePoints as L.LatLngExpression[]
        : [
            [userLoc.lat, userLoc.lng],
            [navigatingQuest.lat, navigatingQuest.lng]
          ];

      // Draw initial / locked street OSRM route line
      const pline = L.polyline(plinePoints, {
        color: '#FF3B7C',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'pulsing-routing-path'
      }).addTo(map);
      polylineRef.current = pline;

      // Inject a distinct, custom Leaflet marker exactly at the destination coordinates.
      // Style it using a glowing hot-pink pin layout with Target emoji (🎯)
      const destinationIcon = L.divIcon({
        className: 'destination-marker-glow',
        html: `
          <div class="relative flex flex-col items-center justify-center cursor-pointer">
            <div class="absolute -inset-1.5 bg-[#FF3B7C]/40 rounded-full animate-ping"></div>
            <div class="absolute -inset-3 bg-[#FF3B7C]/15 rounded-full animate-pulse"></div>
            <div class="w-10 h-10 bg-slate-950 border-2 border-[#FF3B7C] rounded-full shadow-[0_0_15px_rgba(255,59,124,0.9)] flex items-center justify-center z-20 text-md hover:scale-110 transition duration-200">
              🎯
            </div>
            <span class="bg-[#FF3B7C] text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap mt-1 font-mono uppercase tracking-wider z-25">
              TARGET GOAL
            </span>
          </div>
        `,
        iconSize: [60, 60],
        iconAnchor: [30, 30]
      });

      const destMarker = L.marker([navigatingQuest.lat, navigatingQuest.lng], { icon: destinationIcon }).addTo(map);
      destMarker.on('click', () => {
        setSelectedQuest(navigatingQuest);
        const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
        triggerHaptic('soft', hapticEnabled);
      });
      markersRef.current.push(destMarker);
    }

    // Add Active Quest marker pins
    filteredMapQuests.forEach(quest => {
      // If we are actively navigating this quest, we already have a specialized custom destination marker for it
      if (navigatingQuest && navigatingQuest.id === quest.id) {
        return;
      }

      const isUrgent = quest.urgency === 'urgent';
      
      const pinIcon = L.divIcon({
        className: `custom-leaf-pin-${quest.id}`,
        html: `
          <div class="relative flex flex-col items-center">
            ${isUrgent ? '<div class="absolute -inset-1.5 bg-[#FF3B7C]/40 rounded-full animate-ping"></div>' : ''}
            <div class="p-2 rounded-full shadow-lg border-2 border-white transition-all text-white ${
              isUrgent ? 'bg-[#FF3B7C]' : 'bg-[#FFD34D] text-[#1F2A44]'
            }">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <span class="bg-slate-950/90 border border-slate-700 text-[8px] font-black text-white px-1.5 py-0.5 rounded mt-0.5 shadow-md whitespace-nowrap">
              ${quest.cashReward} DA
            </span>
          </div>
        `,
        iconSize: [36, 48],
        iconAnchor: [18, 44]
      });

      const marker = L.marker([quest.lat, quest.lng], { icon: pinIcon }).addTo(map);
      marker.on('click', () => {
        setSelectedQuest(quest);
        const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
        triggerHaptic('soft', hapticEnabled);
      });

      markersRef.current.push(marker);
    });
  }, [filteredMapQuests, gpsActive, userLoc, lang, navigatingQuest, lockedRoutePoints, travelMode]);

  const remainingDistance = navigatingQuest ? calculateDistanceKm(navigatingQuest.lat, navigatingQuest.lng) : 0;
  const remainingDistanceRaw = navigatingQuest ? calculateDistanceKmRaw(navigatingQuest.lat, navigatingQuest.lng) : Infinity;
  const isWithinGeofence = remainingDistanceRaw * 1000 <= 30;
  
  let etaFactor = 12; // default walking 5km/h
  if (travelMode === 'driving') {
    etaFactor = 1.5; // car ~40km/h
  } else if (travelMode === 'cycling') {
    etaFactor = 3; // bike/motorcycle ~20km/h
  }
  const etaMinutes = navigatingQuest ? Math.max(1, Math.round(remainingDistance * etaFactor)) : 0;
  const currentHeading = navigatingQuest && navStartLoc ? calculateHeadingDegree(userLoc.lat, userLoc.lng, navigatingQuest.lat, navigatingQuest.lng) : 0;

  return (
    <div className="space-y-4 pb-12 h-[calc(100vh-140px)] flex flex-col" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      
      {/* Dynamic routing line animations */}
      <style>{`
        @keyframes routingPulseAnim {
          to {
            stroke-dashoffset: -20;
          }
        }
        .pulsing-routing-path {
          stroke-dasharray: 10, 10;
          animation: routingPulseAnim 1.2s linear infinite !important;
        }
      `}</style>

      {/* Horizontal search & distance parameter controls */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 flex flex-col md:flex-row gap-3 shadow-sm shrink-0">
        <div className="relative flex-1">
          <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400 w-4.5 h-4.5`} />
          <input 
            type="text" 
            placeholder={lang === 'ar' ? "ابحث عن مهام على الخريطة..." : "Search coordinates pins..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2.5 bg-gray-50 border border-gray-150 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1F2A44]`}
          />
        </div>

        {/* Proximity range adjust */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-150 px-4 py-2 rounded-2xl text-xs font-semibold">
          <span className="text-gray-500 shrink-0">{lang === 'ar' ? 'نطاق البحث:' : 'Search Range:'}</span>
          <input 
            type="range" 
            min="5" 
            max="1200" 
            step="5"
            value={maxDistance}
            onChange={(e) => setMaxDistance(parseInt(e.target.value))}
            className="w-24 md:w-32 accent-[#FF3B7C] h-1.5 bg-gray-200 rounded-lg cursor-pointer"
          />
          <span className="text-[#FF3B7C] font-mono font-black shrink-0">
            {maxDistance >= 1200 ? (lang === 'ar' ? 'كل الجزائر 🇩🇿' : 'All Algeria 🇩🇿') : `${maxDistance} km`}
          </span>
        </div>

        {/* Satellite trigger */}
        <button 
          onClick={triggerGPSGet}
          disabled={isLocating}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-extrabold bg-[#1F2A44] hover:bg-[#1F2A44]/90 text-white cursor-pointer transition-all duration-200 shadow-sm shrink-0"
        >
          <Compass className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
          <span>{isLocating ? 'GPS Telemetry...' : dict.bountyHunterTitle}</span>
        </button>


      </div>

      {/* Styled Map Area wrapper */}
      <div className={
        isFullScreen 
          ? "fixed inset-0 w-screen h-screen bg-slate-900 z-[9999] overflow-hidden" 
          : "flex-1 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden shadow-inner min-h-[350px]"
      }>
        {/* Leaflet interactive Map container element */}
        <div 
          ref={mapContainerRef} 
          className={`absolute inset-0 w-full h-full z-10 transition-all duration-300 ${!isGpsServiceEnabled ? 'blur-md pointer-events-none' : ''}`} 
        />

        {/* Placeholder overlay stating Location Services Disabled */}
        {(gpsDenied || !isGpsServiceEnabled) && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center z-[10000] animate-in fade-in duration-300 gap-4">
            <span className="text-sm font-bold text-slate-300 leading-relaxed">
              {lang === 'ar' ? 'يرجى تفعيل موقع الجهاز (GPS) لعرض الخريطة الميدانية' : 'Please enable device location (GPS) to view the field map'}
            </span>
            <button
              onClick={() => {
                setGpsDenied(false);
                setIsGpsServiceEnabled(true);
                triggerGPSGet(true);
              }}
              className="px-5 py-2.5 bg-[#FF3B7C] hover:bg-[#FF3B7C]/90 text-white rounded-xl text-xs font-black shadow-md cursor-pointer transition-transform hover:scale-105 active:scale-95"
            >
              {lang === 'ar' ? 'إعادة المحاولة 🔄' : 'Retry 🔄'}
            </button>
          </div>
        )}

        {/* Full-screen Toggle FAB and Top Region Action Bar */}
        {isFullScreen ? (
          <div className="absolute top-0 left-0 right-0 z-[10005] bg-slate-950/80 backdrop-blur-md p-4 flex items-center justify-between border-b border-slate-800">
            {/* Left section: App name or state */}
            <div className="flex items-center gap-2 select-none">
              <span className="w-2.5 h-2.5 bg-[#FF3B7C] rounded-full animate-pulse"></span>
              <span className="text-[10px] text-slate-300 font-black tracking-widest uppercase">
                {lang === 'ar' ? 'خريطة المهام المباشرة 🇩🇿' : 'LIVE QUEST MAP'}
              </span>
            </div>

            {/* Right section: Dedicated Prominent red close FAB button */}
            <button
              onClick={() => {
                setIsFullScreen(false);
                const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
                triggerHaptic('soft', hapticEnabled);
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-black px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer border border-red-500"
            >
              <Minimize2 className="w-4 h-4 text-white animate-pulse" />
              <span>{lang === 'ar' ? 'تصغير الخريطة / إنهاء المعاينة' : 'Minimize Map / Close View'}</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setIsFullScreen(true);
              const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
              triggerHaptic('soft', hapticEnabled);
            }}
            className="absolute top-40 md:top-4 left-4 z-20 bg-white hover:bg-slate-50 text-slate-850 p-3 rounded-2xl shadow-xl border border-gray-150 backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center gap-2 font-black text-xs uppercase"
            style={{ direction: 'ltr' }}
          >
            <Maximize2 className="w-4 h-4 text-[#FF3B7C]" />
            <span className="hidden md:inline text-[10px] text-slate-850">{lang === 'ar' ? 'ملء الشاشة' : 'Full Screen'}</span>
          </button>
        )}

        {/* Floating Assistant Controls (أزرار المساعدة العائمة) */}
        <div className="absolute right-4 bottom-28 md:top-1/2 md:bottom-auto md:-translate-y-1/2 z-20 flex flex-col gap-2">
          {/* Recenter GPS */}
          <button
            onClick={() => {
              triggerGPSGet(true);
              const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
              triggerHaptic('soft', hapticEnabled);
            }}
            title={lang === 'ar' ? 'تحديد الموقع الجغرافي (GPS)' : 'Get Live Position (GPS)'}
            className="w-11 h-11 bg-[#FF3B7C] hover:bg-[#FF3B7C]/95 text-white rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-115 active:scale-90 border-2 border-white cursor-pointer flex-shrink-0 relative group"
            id="gps-recenter-target-button"
          >
            <Target className={`w-5.5 h-5.5 ${isLocating ? 'animate-pulse text-[#FFD34D]' : 'text-white'}`} />
            <span className="absolute right-14 bg-slate-900 text-white text-[9px] font-bold px-2.5 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {lang === 'ar' ? 'تحديد موقعي الميداني' : 'Snap Camera to GPS'}
            </span>
          </button>

          {/* Zoom In */}
          <button
            onClick={() => {
              handleZoomIn();
              const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
              triggerHaptic('soft', hapticEnabled);
            }}
            title={lang === 'ar' ? 'تكبير' : 'Zoom In'}
            className="w-11 h-11 bg-white hover:bg-slate-50 text-slate-850 rounded-full flex items-center justify-center shadow-xl border border-gray-150 font-black text-lg transition-all hover:scale-110 active:scale-95 cursor-pointer flex-shrink-0"
          >
            ＋
          </button>

          {/* Zoom Out */}
          <button
            onClick={() => {
              handleZoomOut();
              const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
              triggerHaptic('soft', hapticEnabled);
            }}
            title={lang === 'ar' ? 'تصغير' : 'Zoom Out'}
            className="w-11 h-11 bg-white hover:bg-slate-50 text-slate-850 rounded-full flex items-center justify-center shadow-xl border border-gray-150 font-black text-lg transition-all hover:scale-110 active:scale-95 cursor-pointer flex-shrink-0"
          >
            －
          </button>
        </div>

        {/* Quick legend on the map (above map layer pane) */}
        <div className={`absolute ${isFullScreen ? 'top-20' : 'top-4'} left-4 right-4 md:left-auto md:w-60 bg-slate-950/80 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800 space-y-2 text-slate-300 text-[10px] select-none z-20 shadow-md`}>
          <div className="font-extrabold text-[#FFD34D] border-b border-slate-800 pb-1 flex items-center justify-between uppercase font-mono">
            <span>{lang === 'ar' ? 'دليل الخريطة الجغرافية' : 'Algeria Live Tracker'}</span>
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-[#4FC3F7] rounded-full animate-pulse shrink-0"></span>
            <span>{lang === 'ar' ? 'محيط إرسال موقعك (GPS مباشر)' : 'Your satellite center indicator'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-[#FF3B7C] rounded-full shrink-0"></span>
            <span>{lang === 'ar' ? 'كويستات عاجلة (Hot Pink Pulsing)' : 'Urgent high-yield targets'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-[#FFD34D] rounded-full shrink-0"></span>
            <span>{lang === 'ar' ? 'كويستات عادية (Bright Gold)' : 'Available community chores'}</span>
          </div>
        </div>

        {/* Bottom sheet popup template for the selected Quest */}
        <AnimatePresence>
          {selectedQuest && (() => {
            const tokenAmount = Math.max(50, Math.round(selectedQuest.cashReward * 0.10));
            return (
              <motion.div
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 200, opacity: 0 }}
                className="absolute bottom-4 left-4 right-4 bg-slate-950/95 border border-slate-800 rounded-3xl p-4.5 shadow-2xl z-40 flex flex-col sm:flex-row gap-4 items-center justify-between cursor-pointer hover:bg-slate-900 transition-all duration-200 backdrop-blur-md"
                onClick={() => {
                  if (onViewQuestDetail) {
                    onViewQuestDetail(selectedQuest.id);
                  } else {
                    setShowDetailedSheet(selectedQuest);
                  }
                  const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
                  triggerHaptic('sharp', hapticEnabled);
                }}
              >
                <div className="flex gap-3.5 items-center w-full sm:w-auto min-w-0">
                  <div className="w-11 h-11 bg-[#FF3B7C]/15 border border-[#FF3B7C]/30 text-[#FF3B7C] rounded-full flex items-center justify-center shrink-0">
                    <Target className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1 min-w-0 text-start flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-black uppercase tracking-wider">
                      <span className="bg-white/10 text-[#FFD34D] px-2 py-0.5 rounded">
                        {selectedQuest.category}
                      </span>
                      {selectedQuest.urgency === 'urgent' && (
                        <span className="bg-[#FF3B7C] text-white px-2 py-0.5 rounded animate-pulse">
                          {lang === 'ar' ? 'عاجل جداً 🔥' : 'URGENT 🔥'}
                        </span>
                      )}
                      {simulatedDistance && (
                        <span className="bg-[#4FC3F7]/10 text-[#4FC3F7] px-2 py-0.5 rounded">
                          {simulatedDistance} {lang === 'ar' ? 'متبقية' : 'remaining'}
                        </span>
                      )}
                    </div>
                    <h4 className="font-extrabold text-white text-sm sm:text-base leading-snug truncate">
                      {selectedQuest.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-bold truncate flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#4FC3F7]" />
                      {selectedQuest.location}
                    </p>
                  </div>
                </div>

                {/* Compact bounty & Required safety locks tokens metrics */}
                <div className="flex items-center justify-between sm:justify-end gap-5 w-full sm:w-auto border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0">
                  <div className="flex gap-4 font-mono text-center col-span-2">
                    <div className="text-right">
                      <span className="text-[8px] text-slate-400 font-extrabold block uppercase tracking-wider">{lang === 'ar' ? 'العائد النزيه' : 'BOUNTY'}</span>
                      <span className="text-sm font-black text-white">{selectedQuest.cashReward} DA</span>
                    </div>
                    <div className="border-l border-white/10 h-6"></div>
                    <div className="text-right">
                      <span className="text-[8px] text-slate-400 font-extrabold block uppercase tracking-wider">{lang === 'ar' ? 'الرموز المطلوبة' : 'REQUIRED TOKENS'}</span>
                      <span className="text-sm font-black text-[#FFD34D]">⚡ {tokenAmount}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0 items-center">
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onViewQuestDetail) {
                          onViewQuestDetail(selectedQuest.id);
                        } else {
                          setShowDetailedSheet(selectedQuest);
                        }
                        const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
                        triggerHaptic('sharp', hapticEnabled);
                      }}
                      className="bg-[#FF3B7C]/15 border border-[#FF3B7C]/25 text-[#FF3B7C] text-[9px] font-black uppercase px-2.5 py-1.5 rounded-xl hover:bg-[#FF3B7C] hover:text-white transition duration-200 select-none cursor-pointer"
                    >
                      {lang === 'ar' ? 'فتح التفاصيل 🎯' : 'Inspect 🎯'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQuest(null);
                      }}
                      className="bg-white/5 hover:bg-white/15 text-slate-350 p-2 rounded-full transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Dynamic Navigation HUD Card */}
        <AnimatePresence>
          {navigatingQuest && (
            <motion.div
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              className="absolute bottom-4 left-4 right-4 bg-slate-950/95 text-white p-5 rounded-3xl border border-rose-500/40 shadow-2xl z-30 flex flex-col gap-4 backdrop-blur-md"
            >
              {/* Header Details with Compass and Travel Mode Selector */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-3.5">
                <div className="flex items-center gap-3">
                  {/* 360 Rotation Compass guidance pointer */}
                  <div className="relative w-11 h-11 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                    <Compass 
                      className="w-5.5 h-5.5 text-rose-500 transition-transform duration-300 animate-pulse" 
                      style={{ transform: `rotate(${currentHeading}deg)` }} 
                    />
                    <span className="absolute -top-1.5 text-[7px] font-black tracking-widest text-rose-400">N</span>
                  </div>
                  
                  <div className="space-y-0.5 min-w-0 text-start">
                    <span className="text-[9px] text-rose-400 font-extrabold tracking-wider uppercase flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                      {lang === 'ar' ? 'نظام تتبع المسار المباشر' : 'SATELLITE NAVIGATION HUD'}
                    </span>
                    <h4 className="font-extrabold text-white text-xs sm:text-sm truncate max-w-[200px] sm:max-w-xs">{navigatingQuest.title}</h4>
                    <p className="text-[10px] text-slate-400 font-medium truncate">{navigatingQuest.location}</p>
                  </div>
                </div>

                {/* Transportation Mode Select Panel (Feature 5) */}
                <div className="flex bg-slate-100/5 border border-white/5 rounded-xl p-1 gap-1 select-none w-full md:w-auto shrink-0 self-center">
                  <button
                    onClick={() => {
                      setTravelMode('driving');
                      const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
                      triggerHaptic('soft', hapticEnabled);
                    }}
                    title={lang === 'ar' ? 'بالسيارة (Driving Mode)' : 'Car (Driving Mode)'}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase transition-all whitespace-nowrap cursor-pointer ${
                      travelMode === 'driving' 
                        ? 'bg-[#FF3B7C] text-white shadow-md shadow-[#FF3B7C]/20 font-black' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <span>🚗</span>
                    <span>{lang === 'ar' ? 'سيارة' : 'CAR'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setTravelMode('cycling');
                      const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
                      triggerHaptic('soft', hapticEnabled);
                    }}
                    title={lang === 'ar' ? 'بالدراجة النارية (Shortcuts & Motos)' : 'Moto (Shortcuts & Motos)'}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase transition-all whitespace-nowrap cursor-pointer ${
                      travelMode === 'cycling' 
                        ? 'bg-[#FF3B7C] text-white shadow-md shadow-[#FF3B7C]/20 font-black' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <span>🏍️</span>
                    <span>{lang === 'ar' ? 'دراجة' : 'MOTO'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setTravelMode('walking');
                      const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
                      triggerHaptic('soft', hapticEnabled);
                    }}
                    title={lang === 'ar' ? 'مشياً على الأقدام (Alleys & Narrow Paths)' : 'Pedestrian (Alleys & Narrow Paths)'}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase transition-all whitespace-nowrap cursor-pointer ${
                      travelMode === 'walking' 
                        ? 'bg-[#FF3B7C] text-white shadow-md shadow-[#FF3B7C]/20 font-black' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <span>🚶</span>
                    <span>{lang === 'ar' ? 'مشياً' : 'WALK'}</span>
                  </button>
                </div>
              </div>

              {/* Navigation Data Indicators and Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex gap-6 font-mono text-center w-full sm:w-auto justify-around sm:justify-start">
                  <div className="text-start sm:text-center">
                    <span className="text-[8px] text-slate-400 font-bold block uppercase tracking-wider">{lang === 'ar' ? 'المسافة المتبقية' : 'DISTANCE'}</span>
                    <span className="text-sm font-black text-rose-400">{remainingDistance} km</span>
                  </div>
                  <div className="border-l border-white/10 h-8 self-center"></div>
                  <div className="text-start sm:text-center">
                    <span className="text-[8px] text-slate-400 font-bold block uppercase tracking-wider animate-pulse">
                      {travelMode === 'driving' 
                        ? (lang === 'ar' ? 'وقت السيارة المقدر' : 'CAR ETA') 
                        : travelMode === 'cycling'
                          ? (lang === 'ar' ? 'وفت الدراجة المقدر' : 'MOTO ETA')
                          : (lang === 'ar' ? 'وقت المشي المقدر' : 'WALK ETA')
                      }
                    </span>
                    <span className="text-sm font-black text-[#FFD34D]">{etaMinutes} {lang === 'ar' ? 'دقيقة' : 'mins'}</span>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
                  {isWithinGeofence ? (
                    <button
                      onClick={() => {
                        const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
                        triggerHaptic('sharp', hapticEnabled);
                        onArrivedAtQuest(navigatingQuest.id);
                      }}
                      className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-[#FFD34D] to-[#FF3B7C] hover:from-[#FFD34D]/90 hover:to-[#FF3B7C]/90 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-[#FF3B7C]/40 animate-pulse transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer border border-white/20 uppercase tracking-wide"
                    >
                      <span>🏁 {lang === 'ar' ? 'وصلت! أرسل تنبيه الوصول الموثق' : 'Arrived! Confirm Arrival'}</span>
                    </button>
                  ) : (
                    <>
                      {remainingDistance > 0 && (
                        <button
                          onClick={() => {
                            setNavProgress((prev) => {
                              const next = prev + 0.15;
                              const capped = next > 1 ? 1 : next;
                              if (capped >= 1) {
                                showToast(lang === 'ar' ? '🎉 لقد وصلت إلى موقع الكويست الموثق!' : '🎉 You have successfully arrived at the quest coordinate bounds!');
                              }
                              return capped;
                            });
                            const hapticEnabled = userProfile.hapticFeedbackEnabled !== false;
                            triggerHaptic('soft', hapticEnabled);
                          }}
                          className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl hover:scale-105 active:scale-95 transition-all uppercase cursor-pointer"
                        >
                          {lang === 'ar' ? 'خطوة محاكاة ⚡' : 'Simulate Step ⚡'}
                        </button>
                      )}
                      <button
                        onClick={handleExitNavigation}
                        className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 font-black text-xs rounded-xl hover:scale-105 active:scale-95 transition-all uppercase cursor-pointer border border-slate-700"
                      >
                        {lang === 'ar' ? 'إنهاء الملاحة' : 'Exit Guidance'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* DETAILED BOOKING FLOW PREVIEW OVERLAY SHEET */}
        <AnimatePresence>
          {showDetailedSheet && (() => {
            return (
              <div className="fixed inset-0 bg-[#1F2A44]/60 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
                {/* Backdrop closer click hook */}
                <div 
                  className="absolute inset-0 cursor-pointer" 
                  onClick={() => setShowDetailedSheet(null)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 30 }}
                  className="relative max-w-lg w-full z-10 p-2 sm:p-0"
                >
                  <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-gray-100 relative antialiased animate-in fade-in zoom-in duration-200">
                    <UnifiedQuestCard 
                      quest={showDetailedSheet}
                      userProfile={userProfile}
                      userLoc={userLoc}
                      lang={lang}
                      isModal={true}
                      onClose={() => setShowDetailedSheet(null)}
                      onBookQuest={(questId, tokenFee) => {
                        onBookQuest(questId, tokenFee);
                        setShowDetailedSheet(null);
                      }}
                      onStartNavigation={(q) => {
                        setNavigatingQuest(q);
                        setShowDetailedSheet(null);
                      }}
                      onOpenChat={(chatParams) => {
                        const openChatEvent = new CustomEvent('open-chat', {
                          detail: chatParams
                        });
                        window.dispatchEvent(openChatEvent);
                        setShowDetailedSheet(null);
                      }}
                      onManageQuest={onManageQuest}
                      onExtendPendingQuest={onExtendPendingQuest}
                      onExtendActiveContract={onExtendActiveContract}
                      showToast={showToast}
                    />
                  </div>
                </motion.div>
              </div>
            );
            // Bypassed dead code
            const tokenAmount = Math.max(50, Math.round(showDetailedSheet.cashReward * 0.10));
            
            const galleryImages: string[] = [];
            if (showDetailedSheet.images && showDetailedSheet.images.length > 0) {
              galleryImages.push(...showDetailedSheet.images);
            } else if (showDetailedSheet.imageUrls && showDetailedSheet.imageUrls.length > 0) {
              galleryImages.push(...showDetailedSheet.imageUrls);
            } else if (showDetailedSheet.imageUrl) {
              galleryImages.push(showDetailedSheet.imageUrl);
            }

            const isBookedByMe = showDetailedSheet.helperId === userProfile.id && showDetailedSheet.status === 'booked';

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

            return (
              <div className="fixed inset-0 bg-[#1F2A44]/70 backdrop-blur-xs flex items-center justify-center p-4 z-[999] overflow-y-auto">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative flex flex-col my-8"
                >
                  {/* Upper Header with prominent "X" close button to preserve map state */}
                  <div className="p-6 pb-4 relative flex flex-col items-start border-b border-gray-100 bg-linear-to-b from-gray-50/50 to-white">
                    <button
                      onClick={() => setShowDetailedSheet(null)}
                      className="absolute top-5 right-5 bg-slate-900 hover:bg-slate-800 text-white rounded-full p-2.5 w-10 h-10 shadow-lg flex items-center justify-center transition-all duration-200 active:scale-90 z-25 cursor-pointer text-base focus:outline-none"
                      title={lang === 'ar' ? 'العودة للخريطة' : 'Back to Map'}
                    >
                      <X className="w-5 h-5 font-black shrink-0" />
                    </button>

                    <div className="flex flex-wrap gap-2 mb-2 pr-12">
                      <span className="bg-[#1F2A44] text-[#FFD34D] text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {showDetailedSheet.category}
                      </span>
                      {showDetailedSheet.urgency === 'urgent' && (
                        <span className="bg-[#FF3B7C] text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">
                          {lang === 'ar' ? 'عاجل جداً 🔥' : 'Urgent 🔥'}
                        </span>
                      )}
                      {showDetailedSheet.urgency === 'featured' && (
                        <span className="bg-[#FFD34D] text-[#1F2A44] text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                          ⭐ {lang === 'ar' ? 'مميز' : 'Featured'}
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-snug tracking-tight text-start mt-1 pr-10">
                      {showDetailedSheet.title}
                    </h3>
                  </div>

                  {/* Detailed Description, Interactive Gallery Grid & Required Equipment List */}
                  <div className="p-6 space-y-5 overflow-y-auto max-h-[50vh] scrollbar-thin scrollbar-thumb-gray-200 text-start">
                    <div>
                      <h4 className="text-gray-400 font-bold text-[10px] uppercase mb-1.5">{lang === 'ar' ? 'تفاصيل المهمة بالكامل' : 'Quest Description Details'}</h4>
                      <p className="text-xs sm:text-sm text-gray-750 leading-relaxed font-bold bg-slate-50 p-4 rounded-2xl border border-gray-150/65 whitespace-pre-line text-start">
                        {showDetailedSheet.description}
                      </p>
                    </div>

                    {/* Facebook-style image grid layout */}
                    {galleryImages.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-gray-400 font-bold text-[10px] uppercase text-start">
                          {lang === 'ar' ? 'معرض الصور التوضيحية (انقر للتكبير) 🎥' : 'Quest Image Gallery (tap to preview) 🎥'}
                        </h4>
                        {galleryImages.length === 1 && (
                          <div 
                            className="w-full h-52 sm:h-60 rounded-2xl overflow-hidden shadow-xs cursor-pointer relative bg-gray-50 border border-gray-150/70" 
                            onClick={() => setLightboxImage(galleryImages[0])}
                          >
                            <img src={galleryImages[0]} alt="Quest reference details" className="w-full h-full object-cover hover:scale-[1.012] transition duration-350" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        {galleryImages.length === 2 && (
                          <div className="grid grid-cols-2 gap-2 h-36 sm:h-44 rounded-2xl overflow-hidden bg-gray-50 border border-gray-150/70">
                            {galleryImages.map((img, idx) => (
                              <div key={idx} className="h-full w-full cursor-pointer overflow-hidden relative" onClick={() => setLightboxImage(img)}>
                                <img src={img} alt={`Quest detailed ${idx + 1}`} className="w-full h-full object-cover hover:scale-102 transition duration-350" referrerPolicy="no-referrer" />
                              </div>
                            ))}
                          </div>
                        )}
                        {galleryImages.length === 3 && (
                          <div className="grid grid-cols-3 gap-2 h-40 sm:h-48 rounded-2xl overflow-hidden bg-gray-50 border border-gray-150/70">
                            <div className="col-span-2 h-full cursor-pointer overflow-hidden relative" onClick={() => setLightboxImage(galleryImages[0])}>
                              <img src={galleryImages[0]} alt="Quest principal reference" className="w-full h-full object-cover hover:scale-102 transition duration-350" referrerPolicy="no-referrer" />
                            </div>
                            <div className="grid grid-rows-2 gap-2 h-full">
                              {galleryImages.slice(1, 3).map((img, idx) => (
                                <div key={idx} className="h-full w-full cursor-pointer overflow-hidden relative" onClick={() => setLightboxImage(img)}>
                                  <img src={img} alt={`Quest detailed secondary ${idx + 2}`} className="w-full h-full object-cover hover:scale-102 transition duration-350" referrerPolicy="no-referrer" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {galleryImages.length >= 4 && (
                          <div className="grid grid-cols-3 gap-2 h-40 sm:h-48 rounded-2xl overflow-hidden bg-gray-50 border border-gray-150/70">
                            <div className="col-span-2 h-full cursor-pointer overflow-hidden relative" onClick={() => setLightboxImage(galleryImages[0])}>
                              <img src={galleryImages[0]} alt="Quest core graphic reference" className="w-full h-full object-cover hover:scale-102 transition duration-350" referrerPolicy="no-referrer" />
                            </div>
                            <div className="grid grid-rows-3 gap-2 h-full">
                              {galleryImages.slice(1, 4).map((img, idx) => {
                                const isLast = idx === 2;
                                const extraCount = galleryImages.length - 4;
                                return (
                                  <div key={idx} className="h-full w-full cursor-pointer overflow-hidden relative" onClick={() => setLightboxImage(img)}>
                                    <img src={img} alt={`Quest detailed carousel mini ${idx + 2}`} className="w-full h-full object-cover hover:scale-102 transition duration-350" referrerPolicy="no-referrer" />
                                    {isLast && extraCount > 0 && (
                                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-black text-xs select-none">
                                        +{extraCount + 1}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}



                    {/* Location Area Details */}
                    <div className="border-t border-gray-150 pt-4 text-start">
                      <h4 className="text-gray-400 font-bold text-[10px] uppercase mb-1">{lang === 'ar' ? 'الموقع الجغرافي للمهمة' : 'Chore Delivery Landmark Location'}</h4>
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-700 bg-gray-50 p-3 rounded-2xl border border-gray-150/50">
                        <MapPin className="w-4 h-4 text-[#4FC3F7] shrink-0" />
                        <span>{showDetailedSheet.location}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Card Details */}
                  <div className="p-6 bg-[#1F2A44] border-t border-white/10 rounded-b-3xl">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[9px] text-[#FFD34D] block font-black uppercase tracking-wider mb-1 text-start">
                            💰 {lang === 'ar' ? 'العائد المالي النقدي الميداني' : 'Direct Cash Payout'}
                          </span>
                          <span className="text-xl sm:text-2xl font-black text-white font-mono flex items-baseline gap-1">
                            {showDetailedSheet.cashReward} <span className="text-xs font-sans text-gray-300 font-semibold">{lang === 'ar' ? 'دينار جزائري' : 'DZD'}</span>
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] text-gray-300 block font-black uppercase tracking-wider mb-1">
                            ⚡ {lang === 'ar' ? 'الرمز المطلوب لحجز والمؤمن' : 'Required Tokens'}
                          </span>
                          <span className="text-md sm:text-lg font-black text-[#FFD34D] font-mono flex items-center justify-end gap-1">
                            ⚡ {tokenAmount} <span className="text-[10px] font-sans text-gray-300 font-bold">Tokens</span>
                          </span>
                        </div>
                      </div>

                      <div className="text-[9.5px] text-gray-300 font-bold leading-relaxed border-t border-white/10 pt-2 text-start">
                        ℹ️ {lang === 'ar' 
                          ? 'الدفع يتم يداً بيد نقداً مائة بالمائة أو عبر تطبيق بريدي موب (BaridiMob) فور التسليم الميداني. يتم استخدام الرموز المطلوبة فقط لحجز وتثبيت الكويست.' 
                          : 'Paid directly in cash or via BaridiMob transfer on completion. Required tokens are consumed only to book and secure the quest opportunity.'}
                      </div>

                      <div className="space-y-2 pt-1">
                        {showDetailedSheet.applicants?.some(a => a.userId === userProfile.id) ? (
                          <button
                            disabled
                            className="w-full bg-white/10 text-gray-300 py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center p-2.5 gap-2"
                          >
                            <span className="text-center">{lang === 'ar' ? 'تم تقديم طلبك بنجاح.. في انتظار اختيار صاحب العمل ⏳' : 'Application pending.. Awaiting creator selection ⏳'}</span>
                          </button>
                        ) : (calculateDistanceKm(showDetailedSheet.lat, showDetailedSheet.lng) > 50) ? (
                          <button
                            disabled
                            className="w-full bg-gray-500 text-gray-200 py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 cursor-not-allowed opacity-80"
                          >
                            <MapPin className="w-4.5 h-4.5 text-gray-200" />
                            <span className="text-center text-[10px] sm:text-xs">
                              هذه المهمة خارج نطاقك الجغرافي المتاح للحجز 📍
                            </span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              handleMapBookClick(showDetailedSheet);
                              setShowDetailedSheet(null);
                            }}
                            className={`w-full py-3.5 rounded-2xl font-black text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 text-center ${
                              isBookedByMe 
                                ? 'bg-emerald-600 text-white shadow-emerald-600/10' 
                                : 'bg-[#FF3B7C] hover:bg-[#FF3B7C]/95 text-white shadow-[#FF3B7C]/25'
                            }`}
                          >
                            <Award className="w-4.5 h-4.5" />
                            <span>
                              {isBookedByMe 
                                ? (lang === 'ar' ? 'أنت تحجز هذه المهمة حالياً' : 'You are currently navigating this quest')
                                : (lang === 'ar' 
                                    ? `احجز المهمة الآن: يخصم ${tokenAmount} رمز ⚡` 
                                    : `Book Quest Now: Deduct ${tokenAmount} Tokens ⚡`
                                  )
                              }
                            </span>
                          </button>
                        )}
                        <button
                          onClick={() => setShowDetailedSheet(null)}
                          className="w-full bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                        >
                          {lang === 'ar' ? 'العودة إلى الخريطة' : 'Back to Live Map'}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>

        {/* GLORIOUS LIGHTBOX PREVIEW */}
        <AnimatePresence>
          {lightboxImage && (
            <div 
              className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center p-4 cursor-zoom-out select-none"
              onClick={() => setLightboxImage(null)}
            >
              <button 
                className="absolute top-6 right-6 bg-slate-900/80 text-white p-3 rounded-full hover:bg-slate-800 transition shadow-lg shrink-0 z-30"
                onClick={() => setLightboxImage(null)}
              >
                <X className="w-6 h-6 stroke-[3px]" />
              </button>
              <motion.img 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                src={lightboxImage} 
                alt="Fullscreen focused reference" 
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/5" 
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </AnimatePresence>

      </div>

      {/* Info notice */}
      <div className="bg-[#1F2A44]/5 border border-[#1F2A44]/10 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-slate-600 font-medium leading-relaxed shrink-0">
        <Info className="w-4.5 h-4.5 text-[#1F2A44] shrink-0 mt-0.5" />
        <p>
          {lang === 'ar' 
            ? 'خريطة صائد الكويستات التفاعلية المباشرة، التي تعتمد على OpenStreetMap وتحدث كل مهام الجزائر في الوقت الفعلي. انقر على الدبابيس لحجز المهام.'
            : 'Interactive Hunt coordinates mapped using live OpenStreetMap layers across the entirety of Algeria. Red is urgent, gold is standard.'}
        </p>
      </div>

    </div>
  );
}
