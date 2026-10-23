import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  IssueAnalysisResult,
  IssueCategory,
  SuggestedPriority,
  issueAnalysisService,
} from './src/services/issueAnalysisService';
import {
  apiClient,
  transformBackendReport,
  formatReportDate,
  ApiError,
  ReportStatus,
  IssueReportItem,
  UserProfile,
} from './src/services/api';
import { authStorage } from './src/services/authStorage';
import { CivicHeatmapScreen } from './src/components/CivicHeatmapScreen';
import { THEME } from './src/theme';

type TabType = 'home' | 'explore' | 'reports';

const CATEGORY_OPTIONS: { label: IssueCategory; icon: string }[] = [
  { label: 'Road Damage', icon: '🚧' },
  { label: 'Garbage', icon: '🗑️' },
  { label: 'Broken Streetlight', icon: '💡' },
  { label: 'Waterlogging', icon: '🌊' },
  { label: 'Water Supply', icon: '🚰' },
  { label: 'Other', icon: '📌' },
];

const INITIAL_SAMPLE_REPORTS: IssueReportItem[] = [
  {
    id: 'sample-1',
    referenceNo: 'CL-1001',
    title: 'Pothole on Main Road',
    category: 'Road Damage',
    description: 'Deep road crater causing heavy vehicular slowdowns near the junction.',
    location: 'Main Road',
    latitude: 28.6139,
    longitude: 77.2090,
    ward: 'Downtown Ward 14',
    status: 'Reported',
    upvotes: 4,
    categoryIcon: '🚧',
    suggestedPriority: 'High',
    createdAt: formatReportDate(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
  },
  {
    id: 'sample-2',
    referenceNo: 'CL-1002',
    title: 'Garbage Overflow',
    category: 'Garbage',
    description: 'Community bins spilling onto the pavement, needs scheduled pickup.',
    location: 'Market Street',
    latitude: 28.6219,
    longitude: 77.2144,
    ward: 'Downtown Ward 14',
    status: 'Under Review',
    upvotes: 2,
    categoryIcon: '🗑️',
    suggestedPriority: 'Medium',
    createdAt: formatReportDate(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  },
  {
    id: 'sample-3',
    referenceNo: 'CL-1003',
    title: 'Broken Streetlight',
    category: 'Broken Streetlight',
    description: 'Post pole flickering at night, creating dark spots near the park lane.',
    location: 'Park Avenue',
    latitude: 28.6080,
    longitude: 77.2220,
    ward: 'Downtown Ward 14',
    status: 'Resolved',
    upvotes: 7,
    categoryIcon: '💡',
    suggestedPriority: 'Low',
    createdAt: formatReportDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()),
  },
];

export default function App() {
  // Authentication state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginRole, setLoginRole] = useState<'Citizen' | 'Ward Officer'>('Citizen');
  const [regName, setRegName] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginWard, setLoginWard] = useState<string>('Downtown Ward 14');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isReportingFlow, setIsReportingFlow] = useState<boolean>(false);

  // Reports state & backend synchronization
  const [reports, setReports] = useState<IssueReportItem[]>(INITIAL_SAMPLE_REPORTS);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);
  const [isRefreshingReports, setIsRefreshingReports] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Filter state for "My Reports"
  const [reportFilter, setReportFilter] = useState<'All' | ReportStatus>('All');

  // Filter state for Ward Officer Dashboard Queue
  const [officerFilter, setOfficerFilter] = useState<
    'All' | 'Reported' | 'High' | 'In Progress' | 'Resolved' | 'Rejected'
  >('All');
  const [officerWardScope, setOfficerWardScope] = useState<'Ward Only' | 'All Wards'>('Ward Only');

  // Form state
  const [category, setCategory] = useState<IssueCategory>('Road Damage');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Location detection state
  const [isDetectingLocation, setIsDetectingLocation] = useState<boolean>(false);

  // Duplicate detection & highlight state
  const [dismissedDuplicateId, setDismissedDuplicateId] = useState<string | null>(null);
  const [isUpvotingDuplicate, setIsUpvotingDuplicate] = useState<boolean>(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<IssueAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<{
    title?: string;
    description?: string;
    location?: string;
  }>({});

  // Submission success banner state
  const [submittedReport, setSubmittedReport] = useState<IssueReportItem | null>(null);

  // Report Details modal state
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detailedReport, setDetailedReport] = useState<IssueReportItem | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  /**
   * Loads reports from FastAPI backend (GET /api/reports)
   */
  const fetchReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshingReports(true);
    } else {
      setIsLoadingReports(true);
    }
    setBackendError(null);

    try {
      const data = await apiClient.getReports();
      const transformed = data.map(transformBackendReport);
      setReports(transformed);
    } catch (err: any) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Unable to connect to CivicLens backend. Using offline demo data.';
      setBackendError(msg);
    } finally {
      setIsLoadingReports(false);
      setIsRefreshingReports(false);
    }
  }, []);

  // Restore authenticated session safely on startup
  useEffect(() => {
    (async () => {
      try {
        const storedUser = await authStorage.getUser();
        const storedToken = await authStorage.getToken();
        if (storedUser && storedToken) {
          setCurrentUser(storedUser);
        }
      } catch (err) {
        console.warn('Session restoration failed:', err);
      }
    })();
  }, []);

  // Fetch reports on mount
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  /**
   * Fetches full report details (GET /api/reports/{id})
   */
  const handleOpenReportDetails = async (reportId: string) => {
    setSelectedReportId(reportId);
    setIsLoadingDetails(true);
    setDetailsError(null);

    // Initial fallback from cached list
    const cached = reports.find((r) => r.id === reportId);
    setDetailedReport(cached || null);

    try {
      const backendData = await apiClient.getReportById(reportId);
      const transformed = transformBackendReport(backendData);
      if (cached?.aiAnalysis) {
        transformed.aiAnalysis = cached.aiAnalysis;
      }
      setDetailedReport(transformed);
    } catch (err: any) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Could not fetch live report details from backend.';
      setDetailsError(msg);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  /**
   * Updates report workflow status (PATCH /api/reports/{id}/status)
   * Supports both quick actions on cards (passing reportId) and modal actions.
   */
  const handleUpdateStatus = async (
    targetOrStatus: string | ReportStatus,
    explicitStatus?: ReportStatus
  ) => {
    const reportId = typeof explicitStatus === 'string' ? (targetOrStatus as string) : detailedReport?.id;
    const newStatus = typeof explicitStatus === 'string' ? explicitStatus : (targetOrStatus as ReportStatus);
    if (!reportId) return;

    setIsUpdatingStatus(true);

    try {
      const updatedBackend = await apiClient.updateReportStatus(reportId, newStatus);
      const transformed = transformBackendReport(updatedBackend);
      if (detailedReport?.id === reportId && detailedReport.aiAnalysis) {
        transformed.aiAnalysis = detailedReport.aiAnalysis;
      }

      setReports((prev) =>
        prev.map((item) => (item.id === reportId ? transformed : item))
      );
      if (detailedReport?.id === reportId) {
        setDetailedReport(transformed);
      }
      Alert.alert('Status Updated', `Report ${transformed.referenceNo} is now "${newStatus}".`);
    } catch (err: any) {
      // Optimistic fallback for demo / offline resilience
      setReports((prev) =>
        prev.map((item) => (item.id === reportId ? { ...item, status: newStatus } : item))
      );
      if (detailedReport?.id === reportId) {
        setDetailedReport((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : `Report status updated to "${newStatus}" locally.`;
      Alert.alert('Status Updated', msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  /**
   * Real User Authentication Handlers (Backend JWT & SecureStore)
   */
  const handleAuthSubmit = async () => {
    setLoginError(null);

    if (authMode === 'register' && !regName.trim()) {
      setLoginError('Please enter your full name.');
      return;
    }
    if (!loginEmail.trim()) {
      setLoginError('Please enter your email address.');
      return;
    }
    if (!loginPassword.trim()) {
      setLoginError('Please enter your password.');
      return;
    }
    if (authMode === 'register' && loginPassword.length < 6) {
      setLoginError('Password must be at least 6 characters.');
      return;
    }

    setIsLoggingIn(true);
    try {
      if (authMode === 'register') {
        const authData = await apiClient.register({
          name: regName.trim(),
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
          role: loginRole,
          ward: loginWard || 'Downtown Ward 14',
        });
        setCurrentUser(authData.user);
        Alert.alert('Registration Successful', `Welcome to CivicLens AI, ${authData.user.name}!`);
      } else {
        const authData = await apiClient.login({
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
        });
        setCurrentUser(authData.user);
      }
      setLoginPassword('');
    } catch (err: any) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Authentication failed. Please verify your credentials and network connection.';
      setLoginError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleDemoLogin = async (role: 'Citizen' | 'Ward Officer') => {
    setLoginError(null);
    setIsLoggingIn(true);
    const demoEmail = role === 'Citizen' ? 'priya.sharma@civiclens.org' : 'rajesh.verma@civicgov.in';
    const demoPw = 'CivicDemo#2026';

    try {
      // Attempt real login with seeded demo account
      const authData = await apiClient.login({ email: demoEmail, password: demoPw });
      setCurrentUser(authData.user);
    } catch {
      // If demo account not yet registered in live Mongo, automatically register it seamlessly
      try {
        const registered = await apiClient.register({
          name: role === 'Citizen' ? 'Priya Sharma' : 'Insp. Rajesh Verma',
          email: demoEmail,
          password: demoPw,
          role: role,
          ward: 'Downtown Ward 14',
        });
        setCurrentUser(registered.user);
      } catch (regErr: any) {
        // Fallback for offline demo mode
        setCurrentUser({
          id: role === 'Citizen' ? 'USR-1082' : 'OFF-4091',
          name: role === 'Citizen' ? 'Priya Sharma' : 'Insp. Rajesh Verma',
          email: demoEmail,
          role: role,
          ward: 'Downtown Ward 14',
        });
      }
    } finally {
      setIsLoggingIn(false);
      setLoginPassword('');
    }
  };

  const handleGuestAccess = () => {
    setCurrentUser({
      id: 'GUEST-99',
      name: 'Guest Citizen',
      email: 'guest@civiclens.org',
      role: 'Citizen',
      ward: 'Downtown Ward 14',
    });
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of CivicLens AI?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await apiClient.logout();
            setCurrentUser(null);
            setIsReportingFlow(false);
            setActiveTab('home');
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setLatitude(null);
    setLongitude(null);
    setImageUri(null);
    setCategory('Road Damage');
    setErrors({});
    setIsAnalyzing(false);
    setAnalysisResult(null);
    setAnalysisError(null);
    setSubmitError(null);
    setIsSubmitting(false);
    setDismissedDuplicateId(null);
    setIsDetectingLocation(false);
  };

  /**
   * Directly opens device camera to snap issue photo
   */
  const takePhotoWithCamera = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Permission to access the camera is required to capture civic issue photos directly.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Camera Error', 'Unable to capture photo. Please try again.');
    }
  };

  /**
   * Opens photo gallery
   */
  const pickImageFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Gallery Permission Required',
          'Permission to access the media library is needed to select an issue photo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Gallery Error', 'Unable to open gallery. Please try again.');
    }
  };

  /**
   * Directly determines location using phone's current GPS location
   */
  const handleDetectCurrentLocation = async () => {
    setIsDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Permission to access location was denied. Please grant location access in device settings.'
        );
        return;
      }

      const currentPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const lat = currentPos.coords.latitude;
      const lng = currentPos.coords.longitude;
      setLatitude(lat);
      setLongitude(lng);

      // Attempt reverse geocoding to human-readable address
      try {
        const reverseAddresses = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });

        if (reverseAddresses && reverseAddresses.length > 0) {
          const item = reverseAddresses[0];
          const parts = [
            item.name,
            item.street,
            item.district || item.subregion,
            item.city,
          ].filter(Boolean);
          const readable = parts.join(', ') || `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setLocation(readable);
        } else {
          setLocation(`GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      } catch {
        setLocation(`GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    } catch {
      Alert.alert(
        'GPS Detection Failed',
        'Could not determine your device location. Please ensure GPS is enabled or enter the landmark manually.'
      );
    } finally {
      setIsDetectingLocation(false);
    }
  };

  /**
   * AI Duplicate Issue Detection Engine
   * Detects whether an active open report matches category, key words, or GPS location.
   */
  const detectedDuplicate = useMemo(() => {
    const cleanTitle = title.trim().toLowerCase();
    const cleanDesc = description.trim().toLowerCase();
    if (cleanTitle.length < 3 && cleanDesc.length < 5) return null;

    const stopWords = new Set([
      'the', 'and', 'near', 'on', 'in', 'at', 'is', 'a', 'an', 'of', 'for', 'to', 'with', 'from', 'this', 'that'
    ]);
    const getWords = (str: string) =>
      str
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));

    const inputWords = new Set([...getWords(cleanTitle), ...getWords(cleanDesc)]);

    for (const report of reports) {
      if (report.status === 'Resolved' || report.status === 'Rejected') continue;

      let score = 0;
      if (report.category === category) score += 2;

      const reportWords = getWords(`${report.title} ${report.description} ${report.location}`);
      let matchingWords = 0;
      for (const w of reportWords) {
        if (inputWords.has(w)) matchingWords++;
      }

      if (matchingWords >= 2) score += matchingWords * 2;
      else if (matchingWords === 1) score += 1;

      // Coordinate proximity check if GPS available
      if (latitude && longitude && report.latitude && report.longitude) {
        const dLat = Math.abs(latitude - report.latitude);
        const dLng = Math.abs(longitude - report.longitude);
        if (dLat < 0.005 && dLng < 0.005) {
          score += 4;
        }
      }

      if (score >= 4) {
        return report;
      }
    }
    return null;
  }, [title, description, category, latitude, longitude, reports]);

  /**
   * Highlights / upvotes an existing report instead of submitting a duplicate
   */
  const handleHighlightExistingIssue = async (reportId: string) => {
    setIsUpvotingDuplicate(true);
    try {
      const updated = await apiClient.upvoteReport(reportId);
      const transformed = transformBackendReport(updated);
      setReports((prev) =>
        prev.map((item) => (item.id === reportId ? transformed : item))
      );
      Alert.alert(
        '🌟 Issue Highlighted!',
        `Issue ${transformed.referenceNo} highlighted! Your vote raises municipal priority for the Ward Officer without cluttering the dispatch queue.`,
        [
          {
            text: 'View Issue',
            onPress: () => {
              resetForm();
              setIsReportingFlow(false);
              handleOpenReportDetails(reportId);
            },
          },
          {
            text: 'Return to Feed',
            onPress: () => {
              resetForm();
              setIsReportingFlow(false);
              setActiveTab('home');
            },
          },
        ]
      );
    } catch {
      // Local optimistic fallback
      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId ? { ...item, upvotes: (item.upvotes || 0) + 1 } : item
        )
      );
      Alert.alert(
        '🌟 Issue Highlighted!',
        'Thank you! The existing issue has been highlighted and escalated for inspection.'
      );
      resetForm();
      setIsReportingFlow(false);
      setActiveTab('home');
    } finally {
      setIsUpvotingDuplicate(false);
    }
  };

  const handleRunAnalysis = async () => {
    setAnalysisError(null);

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setAnalysisError('Please enter an issue description before requesting AI analysis.');
      return;
    }

    if (trimmedDescription.length < 8) {
      setAnalysisError(
        'Please provide a slightly more descriptive issue text (at least 8 characters) for meaningful AI analysis.'
      );
      return;
    }

    setIsAnalyzing(true);

    try {
      const result = await issueAnalysisService.analyzeIssue({
        title: title.trim(),
        description: trimmedDescription,
        selectedCategory: category,
        location: location.trim(),
        hasPhoto: Boolean(imageUri),
      });

      setAnalysisResult(result);

      if (result.suggestedCategory && result.suggestedCategory !== category) {
        setCategory(result.suggestedCategory);
      }
    } catch {
      setAnalysisError(
        'AI analysis service is temporarily unavailable. You can still submit your report manually.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Submits report to the FastAPI backend (POST /api/reports).
   * Only reports success after the backend confirms creation.
   */
  const handleReportSubmit = async () => {
    const newErrors: {
      title?: string;
      description?: string;
      location?: string;
    } = {};

    if (!title.trim()) {
      newErrors.title = 'Please provide an issue title';
    } else if (title.trim().length < 4) {
      newErrors.title = 'Title must be at least 4 characters';
    }

    if (!description.trim()) {
      newErrors.description = 'Please describe the issue in detail';
    } else if (description.trim().length < 8) {
      newErrors.description = 'Description should be at least 8 characters';
    }

    if (!location.trim()) {
      newErrors.location = 'Please enter the street or landmark location';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const created = await apiClient.createReport({
        title: title.trim(),
        description: description.trim(),
        category,
        location: location.trim(),
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        ward: currentUser?.ward || 'Downtown Ward 14',
        suggested_priority: analysisResult?.suggestedPriority || 'Medium',
        image_url: imageUri || null,
        user_id: currentUser?.id,
      });

      const transformed = transformBackendReport(created);
      transformed.aiAnalysis = analysisResult;

      setReports((prev) => [transformed, ...prev.filter((r) => r.id !== transformed.id)]);
      setSubmittedReport(transformed);
      resetForm();
    } catch (err: any) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Submission failed. Please check your network and try again.';
      setSubmitError(msg);
      Alert.alert('Submission Failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStatusBadge = (status: ReportStatus) => {
    let badgeBg = THEME.colors.status.reportedBg;
    let badgeTextColor = THEME.colors.status.reportedText;
    let badgeBorder = THEME.colors.status.reportedBorder;

    if (status === 'Under Review') {
      badgeBg = THEME.colors.status.underReviewBg;
      badgeTextColor = THEME.colors.status.underReviewText;
      badgeBorder = THEME.colors.status.underReviewBorder;
    } else if (status === 'In Progress') {
      badgeBg = THEME.colors.status.inProgressBg;
      badgeTextColor = THEME.colors.status.inProgressText;
      badgeBorder = THEME.colors.status.inProgressBorder;
    } else if (status === 'Resolved') {
      badgeBg = THEME.colors.status.resolvedBg;
      badgeTextColor = THEME.colors.status.resolvedText;
      badgeBorder = THEME.colors.status.resolvedBorder;
    } else if (status === 'Rejected') {
      badgeBg = THEME.colors.status.rejectedBg;
      badgeTextColor = THEME.colors.status.rejectedText;
      badgeBorder = THEME.colors.status.rejectedBorder;
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
        <View style={[styles.statusDot, { backgroundColor: badgeTextColor }]} />
        <Text style={[styles.statusBadgeText, { color: badgeTextColor }]}>{status}</Text>
      </View>
    );
  };

  const renderPriorityBadge = (priority: SuggestedPriority) => {
    let bg = THEME.colors.priority.mediumBg;
    let text = THEME.colors.priority.mediumText;
    let border = THEME.colors.priority.mediumBorder;
    let icon = '⚡';

    if (priority === 'High') {
      bg = THEME.colors.priority.highBg;
      text = THEME.colors.priority.highText;
      border = THEME.colors.priority.highBorder;
      icon = '🚨';
    } else if (priority === 'Low') {
      bg = THEME.colors.priority.lowBg;
      text = THEME.colors.priority.lowText;
      border = THEME.colors.priority.lowBorder;
      icon = '🔹';
    }

    return (
      <View style={[styles.priorityBadge, { backgroundColor: bg, borderColor: border }]}>
        <Text style={[styles.priorityBadgeText, { color: text }]}>
          {icon} {priority} Priority
        </Text>
      </View>
    );
  };

  /**
   * Reusable Loading Skeletons
   */
  const renderLoadingSkeletons = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonHeaderRow}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonTitleGroup}>
              <View style={styles.skeletonTag} />
              <View style={styles.skeletonLineLong} />
            </View>
            <View style={styles.skeletonBadge} />
          </View>
          <View style={styles.skeletonBodyLine} />
          <View style={styles.skeletonBodyLineShort} />
          <View style={styles.skeletonFooterRow}>
            <View style={styles.skeletonPill} />
            <View style={styles.skeletonPill} />
          </View>
        </View>
      ))}
    </View>
  );

  /**
   * Reusable Report Card Component
   */
  const renderReportCard = (report: IssueReportItem) => (
    <TouchableOpacity
      key={report.id}
      style={styles.reportCard}
      activeOpacity={0.85}
      onPress={() => handleOpenReportDetails(report.id)}
    >
      <View style={styles.reportCardHeader}>
        <View style={styles.iconAndTitle}>
          <View style={styles.categoryIconBox}>
            <Text style={styles.categoryIcon}>{report.categoryIcon || '📌'}</Text>
          </View>
          <View style={styles.reportTitleArea}>
            <View style={styles.titleRow}>
              {report.referenceNo ? (
                <Text style={styles.reportRefTag}>{report.referenceNo}</Text>
              ) : null}
              {report.category ? (
                <Text style={styles.reportCategory}>{report.category}</Text>
              ) : null}
            </View>
            <Text style={styles.reportTitle} numberOfLines={2}>
              {report.title}
            </Text>
          </View>
        </View>
        {report.status ? renderStatusBadge(report.status) : null}
      </View>

      {report.description ? (
        <Text style={styles.reportDescriptionPreview} numberOfLines={2}>
          {report.description}
        </Text>
      ) : null}

      {/* Suggested priority tag */}
      {report.suggestedPriority ? (
        <View style={styles.cardPriorityRow}>
          {renderPriorityBadge(report.suggestedPriority)}
        </View>
      ) : null}

      {/* Attached photo thumbnail */}
      {report.imageUri ? (
        <View style={styles.reportCardImageWrapper}>
          <Image
            source={{ uri: report.imageUri }}
            style={styles.reportCardImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlayTag}>
            <Text style={styles.imageOverlayTagText}>📸 Photo Attached</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.cardDivider} />

      <View style={styles.reportCardFooter}>
        {report.location ? (
          <View style={styles.footerLocationRow}>
            <Text style={styles.footerPinIcon}>📍</Text>
            <Text style={styles.footerLocationText} numberOfLines={1}>
              {report.location}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {report.createdAt ? (
          <View style={styles.verifiedTag}>
            <Text style={styles.verifiedText}>{report.createdAt}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardTapPrompt}>
        <Text style={styles.cardTapPromptText}>Inspect & Track</Text>
        <Text style={styles.cardTapArrow}>→</Text>
      </View>
    </TouchableOpacity>
  );

  /**
   * "Login & Identification" Screen
   */
  const renderLoginScreen = () => {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.loginScrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.loginBrandCard}>
            <View style={styles.loginBrandIconContainer}>
              <Text style={styles.loginBrandIcon}>🔍</Text>
            </View>
            <View style={styles.loginLiveBadge}>
              <View style={styles.livePulseDot} />
              <Text style={styles.loginLiveBadgeText}>MUNICIPAL CIVIC PORTAL</Text>
            </View>
            <Text style={styles.loginTitle}>CivicLens AI</Text>
            <Text style={styles.loginSubtitle}>
              Smart civic issue detection, intelligent routing, and transparent municipal tracking.
            </Text>
          </View>

          {/* Role Selection Tabs */}
          <View style={styles.loginCard}>
            {/* Mode Switcher: Sign In vs Create Account */}
            <View style={styles.authModeSwitchRow}>
              <TouchableOpacity
                style={[
                  styles.authModeButton,
                  authMode === 'login' && styles.authModeButtonActive,
                ]}
                onPress={() => {
                  setAuthMode('login');
                  setLoginError(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.authModeText,
                    authMode === 'login' && styles.authModeTextActive,
                  ]}
                >
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.authModeButton,
                  authMode === 'register' && styles.authModeButtonActive,
                ]}
                onPress={() => {
                  setAuthMode('register');
                  setLoginError(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.authModeText,
                    authMode === 'register' && styles.authModeTextActive,
                  ]}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.loginCardHeader}>
              {authMode === 'login' ? 'SELECT ACCESS ROLE' : 'REGISTER PROFILE ROLE'}
            </Text>
            <View style={styles.roleTabsRow}>
              <TouchableOpacity
                style={[
                  styles.roleTabButton,
                  loginRole === 'Citizen' && styles.roleTabButtonActive,
                ]}
                onPress={() => {
                  setLoginRole('Citizen');
                  setLoginError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.roleTabIcon}>👥</Text>
                <Text
                  style={[
                    styles.roleTabText,
                    loginRole === 'Citizen' && styles.roleTabTextActive,
                  ]}
                >
                  Citizen
                </Text>
                {loginRole === 'Citizen' && <View style={styles.roleTabIndicator} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleTabButton,
                  loginRole === 'Ward Officer' && styles.roleTabButtonActive,
                ]}
                onPress={() => {
                  setLoginRole('Ward Officer');
                  setLoginError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.roleTabIcon}>🛡️</Text>
                <Text
                  style={[
                    styles.roleTabText,
                    loginRole === 'Ward Officer' && styles.roleTabTextActive,
                  ]}
                >
                  Ward Officer
                </Text>
                {loginRole === 'Ward Officer' && <View style={styles.roleTabIndicator} />}
              </TouchableOpacity>
            </View>

            {/* Error Notification */}
            {loginError && (
              <View style={styles.loginErrorBox}>
                <Text style={styles.loginErrorIcon}>⚠️</Text>
                <Text style={styles.loginErrorMsg}>{loginError}</Text>
              </View>
            )}

            {/* Registration Name Field (Only in register mode) */}
            {authMode === 'register' && (
              <View style={styles.loginFieldGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <View style={styles.loginInputWrapper}>
                  <Text style={styles.loginInputIcon}>👤</Text>
                  <TextInput
                    style={styles.loginTextInput}
                    placeholder="e.g. Ramesh Kumar"
                    placeholderTextColor={THEME.colors.slateMuted}
                    value={regName}
                    onChangeText={(val) => {
                      setRegName(val);
                      if (loginError) setLoginError(null);
                    }}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* Input Fields */}
            <View style={styles.loginFieldGroup}>
              <Text style={styles.inputLabel}>
                {loginRole === 'Citizen' ? 'Email Address' : 'Officer ID / Official Email'}
              </Text>
              <View style={styles.loginInputWrapper}>
                <Text style={styles.loginInputIcon}>
                  {loginRole === 'Citizen' ? '✉️' : '💼'}
                </Text>
                <TextInput
                  style={styles.loginTextInput}
                  placeholder={
                    loginRole === 'Citizen'
                      ? 'e.g. resident@civiclens.org'
                      : 'e.g. officer.ward14@civicgov.in'
                  }
                  placeholderTextColor={THEME.colors.slateMuted}
                  value={loginEmail}
                  onChangeText={(val) => {
                    setLoginEmail(val);
                    if (loginError) setLoginError(null);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.loginFieldGroup}>
              <Text style={styles.inputLabel}>
                {authMode === 'register' ? 'Choose Password (min 6 chars)' : 'Password / Passcode'}
              </Text>
              <View style={styles.loginInputWrapper}>
                <Text style={styles.loginInputIcon}>🔒</Text>
                <TextInput
                  style={[styles.loginTextInput, { paddingRight: 40 }]}
                  placeholder={authMode === 'register' ? 'Create a secure password' : 'Enter your password'}
                  placeholderTextColor={THEME.colors.slateMuted}
                  value={loginPassword}
                  onChangeText={(val) => {
                    setLoginPassword(val);
                    if (loginError) setLoginError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.showPasswordBtn}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.loginFieldGroup}>
              <Text style={styles.inputLabel}>Assigned Jurisdiction</Text>
              <View style={[styles.loginInputWrapper, { backgroundColor: '#F1F5F9' }]}>
                <Text style={styles.loginInputIcon}>📍</Text>
                <TextInput
                  style={[styles.loginTextInput, { color: THEME.colors.primaryNavy, fontWeight: '600' }]}
                  value={loginWard}
                  onChangeText={setLoginWard}
                  placeholder="Enter Ward / Sector"
                />
              </View>
            </View>

            {/* Submit Action */}
            <TouchableOpacity
              style={[styles.loginSubmitBtn, isLoggingIn && { opacity: 0.7 }]}
              onPress={handleAuthSubmit}
              disabled={isLoggingIn}
              activeOpacity={0.85}
            >
              {isLoggingIn ? (
                <View style={styles.loginBtnInnerRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.loginSubmitBtnText}>
                    {authMode === 'register' ? 'Creating Account...' : 'Verifying Access...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.loginBtnInnerRow}>
                  <Text style={styles.loginSubmitBtnText}>
                    {authMode === 'register'
                      ? `Register as ${loginRole}`
                      : `Sign In as ${loginRole}`}
                  </Text>
                  <Text style={styles.loginBtnArrow}>→</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.loginDividerRow}>
              <View style={styles.loginDividerLine} />
              <Text style={styles.loginDividerLabel}>OR QUICK DEMO ACCESS</Text>
              <View style={styles.loginDividerLine} />
            </View>

            {/* Quick Demo Buttons for Hackathon Judges */}
            <View style={styles.demoButtonsRow}>
              <TouchableOpacity
                style={styles.demoPillButton}
                onPress={() => handleDemoLogin('Citizen')}
                activeOpacity={0.8}
                disabled={isLoggingIn}
              >
                <Text style={styles.demoPillIcon}>👤</Text>
                <View>
                  <Text style={styles.demoPillTitle}>Demo Citizen</Text>
                  <Text style={styles.demoPillSub}>Resident View</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.demoPillButton, styles.demoPillButtonOfficial]}
                onPress={() => handleDemoLogin('Ward Officer')}
                activeOpacity={0.8}
                disabled={isLoggingIn}
              >
                <Text style={styles.demoPillIcon}>🛡️</Text>
                <View>
                  <Text style={styles.demoPillTitle}>Demo Officer</Text>
                  <Text style={styles.demoPillSub}>Ward 14 Admin</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Guest / Direct Explorer */}
            <TouchableOpacity
              style={styles.guestAccessLink}
              onPress={handleGuestAccess}
              activeOpacity={0.7}
              disabled={isLoggingIn}
            >
              <Text style={styles.guestAccessText}>Skip & Explore as Guest →</Text>
            </TouchableOpacity>
          </View>

          {/* Security & System Info Footer */}
          <View style={styles.loginFooterBadge}>
            <Text style={styles.loginFooterText}>
              🔒 Protected by CivicLens AI Platform • Connected to Live Backend
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  /**
   * "Report an Issue" Functional Form Screen
   */
  const renderReportScreen = () => {
    if (submittedReport) {
      return (
        <ScrollView
          contentContainerStyle={styles.successScrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.successCard}>
            <View style={styles.successIconBubble}>
              <Text style={styles.successIconCheck}>✓</Text>
            </View>

            <Text style={styles.successTitle}>Report Registered!</Text>
            <Text style={styles.successSubtitle}>
              Your report has been confirmed and stored in the CivicLens system. Municipal teams can now review and resolve it.
            </Text>

            <View style={styles.referenceBadgeContainer}>
              <Text style={styles.referenceLabel}>OFFICIAL TRACKING ID</Text>
              <Text style={styles.referenceCode}>{submittedReport.referenceNo}</Text>
            </View>

            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Category:</Text>
                <Text style={styles.summaryValue}>
                  {submittedReport.categoryIcon} {submittedReport.category}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Title:</Text>
                <Text style={styles.summaryValue}>{submittedReport.title}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Location:</Text>
                <Text style={styles.summaryValue}>{submittedReport.location}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Status:</Text>
                <Text style={[styles.summaryValue, { color: THEME.colors.brandTeal }]}>
                  {submittedReport.status}
                </Text>
              </View>

              {submittedReport.aiAnalysis && (
                <View style={styles.summaryAiSection}>
                  <View style={styles.aiBadgeRow}>
                    <Text style={styles.summaryAiHeader}>✨ AI ADVISORY SNAPSHOT (DEMO)</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Suggested Urgency:</Text>
                    <Text style={styles.summaryValue}>
                      {submittedReport.aiAnalysis.suggestedPriority} Priority
                    </Text>
                  </View>
                  <Text style={styles.summaryAiNote}>
                    💡 {submittedReport.aiAnalysis.recommendedNextAction}
                  </Text>
                </View>
              )}

              {submittedReport.imageUri && (
                <View style={styles.summaryImagePreviewWrapper}>
                  <Text style={styles.summaryKey}>Attached Photo:</Text>
                  <Image
                    source={{ uri: submittedReport.imageUri }}
                    style={styles.summaryAttachedImage}
                    resizeMode="cover"
                  />
                </View>
              )}
            </View>

            <View style={styles.successButtonActions}>
              <TouchableOpacity
                style={styles.primaryActionButton}
                activeOpacity={0.85}
                onPress={() => {
                  setSubmittedReport(null);
                  setIsReportingFlow(false);
                  setActiveTab('home');
                }}
              >
                <Text style={styles.primaryActionText}>View on Live Feed</Text>
                <Text style={styles.actionArrowIcon}>→</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryOutlineButton}
                activeOpacity={0.8}
                onPress={() => {
                  setSubmittedReport(null);
                  resetForm();
                }}
              >
                <Text style={styles.secondaryOutlineButtonText}>Submit Another Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      );
    }

    return (
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formScrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Bar with Back Button */}
          <View style={styles.formTopBar}>
            <TouchableOpacity
              style={styles.backButton}
              activeOpacity={0.7}
              onPress={() => {
                resetForm();
                setIsReportingFlow(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Back to home"
            >
              <Text style={styles.backButtonIcon}>‹</Text>
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>

            <View style={styles.formCategoryBadge}>
              <Text style={styles.formCategoryBadgeText}>Step 1 of 1</Text>
            </View>
          </View>

          {/* Screen Title & Subtitle */}
          <View style={styles.formHeaderSection}>
            <Text style={styles.formScreenTitle}>Report a Civic Issue</Text>
            <Text style={styles.formScreenSubtitle}>
              Provide issue details and location to alert local authorities and fellow citizens.
            </Text>
          </View>

          {/* 1. Category Selection */}
          <View style={styles.inputGroup}>
            <View style={styles.fieldHeaderRow}>
              <Text style={styles.fieldLabel}>
                Issue Category <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              {analysisResult && (
                <Text style={styles.editableHint}>AI editable</Text>
              )}
            </View>
            <View style={styles.categoryGrid}>
              {CATEGORY_OPTIONS.map((item) => {
                const isSelected = category === item.label;
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={[
                      styles.categoryChip,
                      isSelected && styles.categoryChipSelected,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => setCategory(item.label)}
                  >
                    <Text style={styles.categoryChipIcon}>{item.icon}</Text>
                    <Text
                      style={[
                        styles.categoryChipLabel,
                        isSelected && styles.categoryChipLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 2. Photo Attachment Area */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Photo Evidence (Optional)</Text>
            <Text style={styles.fieldHint}>
              High-quality photos speed up inspection and validation by municipal teams.
            </Text>

            {imageUri ? (
              <View style={styles.photoAttachedBox}>
                <Image
                  source={{ uri: imageUri }}
                  style={styles.photoPreview}
                  resizeMode="cover"
                />
                <View style={styles.photoActionsRow}>
                  <TouchableOpacity
                    style={styles.changePhotoBtn}
                    onPress={takePhotoWithCamera}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.changePhotoText}>📸 Retake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.changePhotoBtn}
                    onPress={pickImageFromGallery}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.changePhotoText}>🖼️ Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => setImageUri(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removePhotoText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.photoChoiceGrid}>
                <TouchableOpacity
                  style={styles.photoChoiceBtn}
                  activeOpacity={0.8}
                  onPress={takePhotoWithCamera}
                >
                  <View style={styles.photoUploadIconContainer}>
                    <Text style={styles.photoUploadIcon}>📸</Text>
                  </View>
                  <Text style={styles.photoUploadTitle}>Open Camera</Text>
                  <Text style={styles.photoUploadSubtitle}>Capture issue directly</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.photoChoiceBtn}
                  activeOpacity={0.8}
                  onPress={pickImageFromGallery}
                >
                  <View style={[styles.photoUploadIconContainer, { backgroundColor: '#F1F5F9' }]}>
                    <Text style={styles.photoUploadIcon}>🖼️</Text>
                  </View>
                  <Text style={styles.photoUploadTitle}>From Gallery</Text>
                  <Text style={styles.photoUploadSubtitle}>Choose existing photo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* AI Duplicate Detection Advisory Banner */}
          {detectedDuplicate && detectedDuplicate.id !== dismissedDuplicateId && (
            <View style={styles.duplicateAlertCard}>
              <View style={styles.duplicateHeaderRow}>
                <View style={styles.duplicateIconBubble}>
                  <Text style={styles.duplicateIcon}>⚡</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.duplicateAlertTitle}>AI Similar Issue Detected</Text>
                  <Text style={styles.duplicateAlertSub}>
                    A matching open issue was already registered in this ward!
                  </Text>
                </View>
              </View>

              <View style={styles.duplicateIssueBox}>
                <View style={styles.duplicateBadgeRow}>
                  <Text style={styles.duplicateRefTag}>{detectedDuplicate.referenceNo}</Text>
                  <Text style={styles.duplicateStatusTag}>{detectedDuplicate.status}</Text>
                  <Text style={styles.duplicateHighlightsTag}>
                    🔥 {detectedDuplicate.upvotes || 0} Highlights
                  </Text>
                </View>
                <Text style={styles.duplicateTitleText}>{detectedDuplicate.title}</Text>
                <Text style={styles.duplicateLocationText}>📍 {detectedDuplicate.location}</Text>
                {detectedDuplicate.description ? (
                  <Text style={styles.duplicateDescPreview} numberOfLines={2}>
                    "{detectedDuplicate.description}"
                  </Text>
                ) : null}
              </View>

              <Text style={styles.duplicateAdvisoryText}>
                💡 <Text style={{ fontWeight: '700' }}>Highlight Instead of Resubmitting:</Text> Ward officers prioritize issues with more citizen highlights. Tap below to escalate this existing report without submitting a duplicate!
              </Text>

              <View style={styles.duplicateActionRow}>
                <TouchableOpacity
                  style={styles.duplicateHighlightBtn}
                  onPress={() => handleHighlightExistingIssue(detectedDuplicate.id)}
                  activeOpacity={0.85}
                  disabled={isUpvotingDuplicate}
                >
                  {isUpvotingDuplicate ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.duplicateHighlightBtnIcon}>🚀</Text>
                      <Text style={styles.duplicateHighlightBtnText}>
                        Highlight & Escalate {detectedDuplicate.referenceNo}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.duplicateDismissBtn}
                  onPress={() => setDismissedDuplicateId(detectedDuplicate.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.duplicateDismissText}>Proceed with New Report Anyway →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 3. Issue Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>
              Issue Title <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            <TextInput
              style={[styles.textInput, errors.title ? styles.inputErrorBorder : null]}
              placeholder="e.g. Broken water pipeline leaking on 5th cross"
              placeholderTextColor={THEME.colors.slateLight}
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              maxLength={80}
            />
            {errors.title && (
              <Text style={styles.errorCaptionText}>⚠️ {errors.title}</Text>
            )}
          </View>

          {/* 4. Multiline Description */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>
              Description <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.textAreaInput,
                errors.description ? styles.inputErrorBorder : null,
              ]}
              placeholder="Detail hazards, severity, road accessibility, or relevant landmarks..."
              placeholderTextColor={THEME.colors.slateLight}
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                if (errors.description)
                  setErrors((prev) => ({ ...prev, description: undefined }));
                if (analysisError) setAnalysisError(null);
              }}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.description && (
              <Text style={styles.errorCaptionText}>⚠️ {errors.description}</Text>
            )}
          </View>

          {/* 5. Location Manual & GPS Input */}
          <View style={styles.inputGroup}>
            <View style={styles.fieldHeaderRow}>
              <Text style={styles.fieldLabel}>
                Location Landmark <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <TouchableOpacity
                style={styles.detectGpsButton}
                onPress={handleDetectCurrentLocation}
                disabled={isDetectingLocation}
                activeOpacity={0.75}
              >
                {isDetectingLocation ? (
                  <View style={styles.detectGpsInnerRow}>
                    <ActivityIndicator size="small" color={THEME.colors.brandTeal} />
                    <Text style={styles.detectGpsText}>Detecting...</Text>
                  </View>
                ) : (
                  <View style={styles.detectGpsInnerRow}>
                    <Text style={styles.detectGpsIcon}>📍</Text>
                    <Text style={styles.detectGpsText}>Detect GPS Location</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.textInput, errors.location ? styles.inputErrorBorder : null]}
              placeholder="e.g. Opposite City Central Library, Main Avenue"
              placeholderTextColor={THEME.colors.slateLight}
              value={location}
              onChangeText={(text) => {
                setLocation(text);
                if (errors.location) setErrors((prev) => ({ ...prev, location: undefined }));
              }}
            />
            {latitude !== null && longitude !== null && (
              <View style={styles.gpsCoordinatesBadge}>
                <View style={styles.gpsBadgeLeft}>
                  <Text style={styles.gpsDot}>🟢</Text>
                  <Text style={styles.gpsCoordinatesBadgeText}>
                    GPS: {latitude.toFixed(4)}, {longitude.toFixed(4)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setLatitude(null);
                    setLongitude(null);
                  }}
                >
                  <Text style={styles.gpsRemoveText}>Remove GPS</Text>
                </TouchableOpacity>
              </View>
            )}
            {errors.location ? (
              <Text style={styles.errorCaptionText}>⚠️ {errors.location}</Text>
            ) : (
              <Text style={styles.fieldHint}>
                Use "Detect GPS Location" to auto-fetch coordinates or enter street landmark.
              </Text>
            )}
          </View>

          {/* AI-ASSISTED ISSUE ANALYSIS SECTION */}
          <View style={styles.aiSectionContainer}>
            <View style={styles.aiSectionHeader}>
              <View style={styles.aiHeaderTitleRow}>
                <View style={styles.aiIconBubble}>
                  <Text style={styles.aiIconSparkle}>✨</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.aiLabelHeaderRow}>
                    <Text style={styles.aiSectionTitle}>CivicLens AI Advisor</Text>
                    <View style={styles.aiDemoTag}>
                      <Text style={styles.aiDemoTagText}>DEMO</Text>
                    </View>
                  </View>
                  <Text style={styles.aiSectionSubtitle}>
                    Evaluate urgency, summary & recommended municipal routing
                  </Text>
                </View>
              </View>
            </View>

            {analysisError && (
              <View style={styles.aiErrorBanner}>
                <Text style={styles.aiErrorText}>⚠️ {analysisError}</Text>
              </View>
            )}

            {/* Analysis Action / Loading state */}
            {isAnalyzing ? (
              <View style={styles.aiLoadingBox}>
                <ActivityIndicator size="small" color={THEME.colors.brandTeal} />
                <Text style={styles.aiLoadingText}>
                  Synthesizing report text with simulated Gemma 4 analyzer...
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.analyzeButton}
                activeOpacity={0.8}
                onPress={handleRunAnalysis}
              >
                <Text style={styles.analyzeButtonIcon}>✨</Text>
                <Text style={styles.analyzeButtonText}>
                  {analysisResult ? 'Re-run AI Analysis' : 'Run AI Urgency Analysis'}
                </Text>
              </TouchableOpacity>
            )}

            {/* AI Analysis Result Display */}
            {analysisResult && !isAnalyzing && (
              <View style={styles.aiResultCard}>
                <View style={styles.aiDisclaimerBadge}>
                  <Text style={styles.aiDisclaimerBadgeText}>
                    AI ADVISORY SUGGESTION • YOU REMAIN IN CONTROL
                  </Text>
                </View>

                {/* Priority Row */}
                <View style={styles.aiResultHeaderRow}>
                  {renderPriorityBadge(analysisResult.suggestedPriority)}
                  <Text style={styles.aiTimeText}>{analysisResult.analyzedAt}</Text>
                </View>

                {/* Suggested Category */}
                <View style={styles.aiResultFieldGroup}>
                  <Text style={styles.aiResultFieldLabel}>SUGGESTED CATEGORY</Text>
                  <View style={styles.suggestedCategoryRow}>
                    <Text style={styles.suggestedCategoryText}>
                      {analysisResult.suggestedCategory}
                    </Text>
                    {category === analysisResult.suggestedCategory ? (
                      <View style={styles.categoryAppliedBadge}>
                        <Text style={styles.categoryAppliedText}>✓ Applied</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.applyCategoryBtn}
                        onPress={() => setCategory(analysisResult.suggestedCategory)}
                      >
                        <Text style={styles.applyCategoryBtnText}>Apply to Form</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Concise Summary */}
                <View style={styles.aiResultFieldGroup}>
                  <Text style={styles.aiResultFieldLabel}>SYNTHESIZED SUMMARY</Text>
                  <Text style={styles.aiSummaryContent}>{analysisResult.summary}</Text>
                </View>

                {/* Priority Explanation */}
                <View style={styles.aiResultFieldGroup}>
                  <Text style={styles.aiResultFieldLabel}>SEVERITY JUSTIFICATION</Text>
                  <Text style={styles.aiExplanationContent}>
                    {analysisResult.priorityExplanation}
                  </Text>
                </View>

                {/* Recommended Next Action */}
                <View style={styles.aiResultFieldGroup}>
                  <Text style={styles.aiResultFieldLabel}>RECOMMENDED MUNICIPAL ACTION</Text>
                  <Text style={styles.aiActionContent}>
                    👉 {analysisResult.recommendedNextAction}
                  </Text>
                </View>

                {/* Clear mock service disclaimer */}
                <View style={styles.aiProviderDisclaimer}>
                  <Text style={styles.aiProviderDisclaimerText}>
                    ⚡ Model: {analysisResult.modelIdentifier}. All results are simulated
                    recommendations and non-binding. You can edit title, category, and details
                    freely above before submitting.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Submit error banner if backend rejects or is unreachable */}
          {submitError && (
            <View style={styles.backendErrorBanner}>
              <Text style={styles.backendErrorTitle}>Submission Issue</Text>
              <Text style={styles.backendErrorText}>{submitError}</Text>
            </View>
          )}

          {/* 6. Submit Button */}
          <View style={styles.formActionArea}>
            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              activeOpacity={0.85}
              onPress={handleReportSubmit}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Submit Report"
            >
              {isSubmitting ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>Submitting to Backend...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Submit Civic Report</Text>
                  <Text style={styles.actionArrowIcon}>✓</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelLink}
              onPress={() => {
                resetForm();
                setIsReportingFlow(false);
              }}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelLinkText}>Cancel and Return Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  /**
   * Dedicated Clean Administrative Interface for the Ward Officer
   */
  const renderWardOfficerDashboard = () => {
    const officerWard = currentUser?.ward || 'Downtown Ward 14';

    // Scope reports: Authorized Ward Only vs All Wards
    const scopedReports = reports.filter((r) => {
      if (officerWardScope === 'All Wards') return true;
      return !r.ward || r.ward.toLowerCase() === officerWard.toLowerCase();
    });

    // Five Core Telemetry Metrics for the Authorized Ward
    const totalWardIssues = scopedReports.length;
    const awaitingReviewCount = scopedReports.filter((r) => r.status === 'Reported').length;
    const highPriorityCount = scopedReports.filter((r) => r.suggestedPriority === 'High').length;
    const inProgressCount = scopedReports.filter(
      (r) => r.status === 'In Progress' || r.status === 'Under Review'
    ).length;
    const resolvedCount = scopedReports.filter((r) => r.status === 'Resolved').length;
    const rejectedCount = scopedReports.filter((r) => r.status === 'Rejected').length;

    // Filter queue according to selected tab
    const filteredQueue = scopedReports.filter((r) => {
      if (officerFilter === 'All') return true;
      if (officerFilter === 'Reported') return r.status === 'Reported';
      if (officerFilter === 'High') return r.suggestedPriority === 'High';
      if (officerFilter === 'In Progress')
        return r.status === 'In Progress' || r.status === 'Under Review';
      if (officerFilter === 'Resolved') return r.status === 'Resolved';
      if (officerFilter === 'Rejected') return r.status === 'Rejected';
      return true;
    });

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingReports}
            onRefresh={() => fetchReports(true)}
            colors={[THEME.colors.brandTeal]}
            tintColor={THEME.colors.brandTeal}
          />
        }
      >
        {/* Ward Officer Header */}
        <View style={styles.header}>
          <View style={styles.headerLeftCol}>
            <View style={styles.brandRow}>
              <View style={[styles.brandLogo, { backgroundColor: THEME.colors.primaryNavy }]}>
                <Text style={styles.brandLogoIcon}>🛡️</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>Ward Officer Command</Text>
                <View style={styles.locationContainer}>
                  <Text style={styles.locationPinIcon}>📍</Text>
                  <Text style={[styles.locationSubtitle, { color: '#0369A1' }]}>
                    Authorized Ward: {officerWard}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.userRoleBadge}
              onPress={handleSignOut}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Officer profile, tap to sign out"
            >
              <Text style={styles.userRoleBadgeIcon}>🛡️</Text>
              <View style={styles.userBadgeTextCol}>
                <Text style={styles.userBadgeName} numberOfLines={1}>
                  {currentUser?.name || 'Officer'}
                </Text>
                <Text style={styles.userBadgeRole}>Ward Officer</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.notificationButton}
              onPress={() => fetchReports(true)}
              accessibilityRole="button"
              accessibilityLabel="Refresh reports"
            >
              <Text style={styles.bellIcon}>🔄</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Backend Error Notice */}
        {backendError && (
          <View style={styles.backendErrorBanner}>
            <View style={styles.backendErrorHeader}>
              <Text style={styles.backendErrorIcon}>⚠️</Text>
              <Text style={styles.backendErrorTitle}>Live Backend Notice</Text>
            </View>
            <Text style={styles.backendErrorText}>{backendError}</Text>
            <TouchableOpacity
              style={styles.retryBackendBtn}
              activeOpacity={0.8}
              onPress={() => fetchReports(false)}
            >
              <Text style={styles.retryBackendBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Administrative Status Banner */}
        <View style={styles.officerHeroBanner}>
          <View style={styles.officerHeroTop}>
            <View style={styles.officerAuthTag}>
              <View style={styles.livePulseDot} />
              <Text style={styles.officerAuthTagText}>OFFICIAL JURISDICTION PORTAL</Text>
            </View>
            <View style={styles.officerScopePills}>
              <TouchableOpacity
                style={[
                  styles.scopePillBtn,
                  officerWardScope === 'Ward Only' && styles.scopePillBtnActive,
                ]}
                onPress={() => setOfficerWardScope('Ward Only')}
              >
                <Text
                  style={[
                    styles.scopePillBtnText,
                    officerWardScope === 'Ward Only' && styles.scopePillBtnTextActive,
                  ]}
                >
                  Ward Only
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.scopePillBtn,
                  officerWardScope === 'All Wards' && styles.scopePillBtnActive,
                ]}
                onPress={() => setOfficerWardScope('All Wards')}
              >
                <Text
                  style={[
                    styles.scopePillBtnText,
                    officerWardScope === 'All Wards' && styles.scopePillBtnTextActive,
                  ]}
                >
                  All Wards
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.officerHeroTitle}>Administrative Command Center</Text>
          <Text style={styles.officerHeroSubtitle}>
            Direct authority to review community petitions, accept or reject issues, and dispatch municipal works teams.
          </Text>
        </View>

        {/* 5 Core Telemetry Metrics Cards */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Ward Telemetry & Telemetrics</Text>
            <Text style={styles.sectionCaption}>
              Authorized jurisdiction metrics for {officerWard}
            </Text>
          </View>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{totalWardIssues} Total</Text>
          </View>
        </View>

        <View style={styles.officerMetricsGrid}>
          {/* 1. Total issues in officer's authorized ward */}
          <TouchableOpacity
            style={[styles.officerMetricCard, officerFilter === 'All' && styles.officerMetricCardActive]}
            onPress={() => setOfficerFilter('All')}
            activeOpacity={0.8}
          >
            <View style={[styles.metricBar, { backgroundColor: '#0F172A' }]} />
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricIcon}>📊</Text>
              <Text style={styles.metricNumber}>{totalWardIssues}</Text>
            </View>
            <Text style={styles.metricTitle}>Total Issues</Text>
            <Text style={styles.metricSub}>In Authorized Ward</Text>
          </TouchableOpacity>

          {/* 2. Issues awaiting review */}
          <TouchableOpacity
            style={[
              styles.officerMetricCard,
              officerFilter === 'Reported' && styles.officerMetricCardActive,
            ]}
            onPress={() => setOfficerFilter('Reported')}
            activeOpacity={0.8}
          >
            <View style={[styles.metricBar, { backgroundColor: '#F59E0B' }]} />
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricIcon}>⏳</Text>
              <Text style={[styles.metricNumber, { color: '#B45309' }]}>
                {awaitingReviewCount}
              </Text>
            </View>
            <Text style={styles.metricTitle}>Awaiting Review</Text>
            <Text style={styles.metricSub}>Requires Action</Text>
          </TouchableOpacity>

          {/* 3. High-priority issues */}
          <TouchableOpacity
            style={[styles.officerMetricCard, officerFilter === 'High' && styles.officerMetricCardActive]}
            onPress={() => setOfficerFilter('High')}
            activeOpacity={0.8}
          >
            <View style={[styles.metricBar, { backgroundColor: '#EF4444' }]} />
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricIcon}>🚨</Text>
              <Text style={[styles.metricNumber, { color: '#DC2626' }]}>
                {highPriorityCount}
              </Text>
            </View>
            <Text style={styles.metricTitle}>High Priority</Text>
            <Text style={styles.metricSub}>Critical Hazards</Text>
          </TouchableOpacity>

          {/* 4. Issues in progress */}
          <TouchableOpacity
            style={[
              styles.officerMetricCard,
              officerFilter === 'In Progress' && styles.officerMetricCardActive,
            ]}
            onPress={() => setOfficerFilter('In Progress')}
            activeOpacity={0.8}
          >
            <View style={[styles.metricBar, { backgroundColor: '#0284C7' }]} />
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricIcon}>🛠️</Text>
              <Text style={[styles.metricNumber, { color: '#0284C7' }]}>
                {inProgressCount}
              </Text>
            </View>
            <Text style={styles.metricTitle}>In Progress</Text>
            <Text style={styles.metricSub}>Field Crews Active</Text>
          </TouchableOpacity>

          {/* 5. Resolved issues */}
          <TouchableOpacity
            style={[
              styles.officerMetricCard,
              officerFilter === 'Resolved' && styles.officerMetricCardActive,
            ]}
            onPress={() => setOfficerFilter('Resolved')}
            activeOpacity={0.8}
          >
            <View style={[styles.metricBar, { backgroundColor: '#10B981' }]} />
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricIcon}>✅</Text>
              <Text style={[styles.metricNumber, { color: '#15803D' }]}>
                {resolvedCount}
              </Text>
            </View>
            <Text style={styles.metricTitle}>Resolved</Text>
            <Text style={styles.metricSub}>Inspected & Done</Text>
          </TouchableOpacity>
        </View>

        {/* Actionable Issue Queue Section */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Administrative Action Queue</Text>
            <Text style={styles.sectionCaption}>
              Accept or reject issues with immediate backend sync
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => fetchReports(true)}
            style={styles.refreshFeedBtn}
          >
            <Text style={styles.seeAllText}>Refresh ↻</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.officerQueueFilterRow}
        >
          {(
            [
              { id: 'All', label: 'All', count: totalWardIssues },
              { id: 'Reported', label: 'Awaiting Review', count: awaitingReviewCount },
              { id: 'High', label: 'High Priority', count: highPriorityCount },
              { id: 'In Progress', label: 'In Progress', count: inProgressCount },
              { id: 'Resolved', label: 'Resolved', count: resolvedCount },
              { id: 'Rejected', label: 'Rejected', count: rejectedCount },
            ] as const
          ).map((tab) => {
            const isSelected = officerFilter === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.officerFilterPill,
                  isSelected && styles.officerFilterPillActive,
                ]}
                onPress={() => setOfficerFilter(tab.id as any)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.officerFilterPillText,
                    isSelected && styles.officerFilterPillTextActive,
                  ]}
                >
                  {tab.label} ({tab.count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Loading Skeletons */}
        {isLoadingReports && renderLoadingSkeletons()}

        {/* Empty State */}
        {!isLoadingReports && filteredQueue.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyIcon}>🛡️</Text>
            </View>
            <Text style={styles.emptyTitle}>No Issues in this Category</Text>
            <Text style={styles.emptySubtitle}>
              All issues matching "{officerFilter}" in {officerWard} have been processed.
            </Text>
          </View>
        )}

        {/* Actionable Report Cards with Direct Accept/Reject Controls */}
        {!isLoadingReports && filteredQueue.length > 0 && (
          <View style={styles.reportsList}>
            {filteredQueue.map((report) => (
              <View key={report.id} style={styles.officerCardWrapper}>
                <TouchableOpacity
                  style={styles.officerCardMain}
                  activeOpacity={0.9}
                  onPress={() => handleOpenReportDetails(report.id)}
                >
                  <View style={styles.reportCardHeader}>
                    <View style={styles.iconAndTitle}>
                      <View style={styles.categoryIconBox}>
                        <Text style={styles.categoryIcon}>{report.categoryIcon || '📌'}</Text>
                      </View>
                      <View style={styles.reportTitleArea}>
                        <View style={styles.titleRow}>
                          <Text style={styles.reportRefTag}>{report.referenceNo}</Text>
                          <Text style={styles.reportCategory}>{report.category}</Text>
                        </View>
                        <Text style={styles.reportTitle} numberOfLines={2}>
                          {report.title}
                        </Text>
                      </View>
                    </View>
                    {renderStatusBadge(report.status)}
                  </View>

                  {report.description ? (
                    <Text style={styles.reportDescriptionPreview} numberOfLines={2}>
                      {report.description}
                    </Text>
                  ) : null}

                  {/* Priority & Community Highlights Bar */}
                  <View style={styles.officerCardMetaRow}>
                    {report.suggestedPriority ? renderPriorityBadge(report.suggestedPriority) : null}
                    <View style={styles.highlightsBadge}>
                      <Text style={styles.highlightsBadgeText}>
                        🔥 {report.upvotes || 0} Citizens Highlighted
                      </Text>
                    </View>
                  </View>

                  {/* Photo if present */}
                  {report.imageUri ? (
                    <View style={styles.reportCardImageWrapper}>
                      <Image
                        source={{ uri: report.imageUri }}
                        style={styles.reportCardImage}
                        resizeMode="cover"
                      />
                      <View style={styles.imageOverlayTag}>
                        <Text style={styles.imageOverlayTagText}>📸 Photo Attached</Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.cardDivider} />

                  <View style={styles.reportCardFooter}>
                    <View style={styles.footerLocationRow}>
                      <Text style={styles.footerPinIcon}>📍</Text>
                      <Text style={styles.footerLocationText} numberOfLines={1}>
                        {report.location}
                      </Text>
                    </View>
                    <View style={styles.verifiedTag}>
                      <Text style={styles.verifiedText}>🕒 {report.createdAt}</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Direct Authority Decision Buttons Bar */}
                <View style={styles.officerActionRow}>
                  {report.status !== 'In Progress' && report.status !== 'Resolved' && (
                    <TouchableOpacity
                      style={styles.officerAcceptBtn}
                      activeOpacity={0.8}
                      onPress={() => handleUpdateStatus(report.id, 'In Progress')}
                      disabled={isUpdatingStatus}
                    >
                      <Text style={styles.officerAcceptBtnText}>✓ Accept Issue</Text>
                    </TouchableOpacity>
                  )}

                  {report.status !== 'Rejected' && report.status !== 'Resolved' && (
                    <TouchableOpacity
                      style={styles.officerRejectBtn}
                      activeOpacity={0.8}
                      onPress={() => handleUpdateStatus(report.id, 'Rejected')}
                      disabled={isUpdatingStatus}
                    >
                      <Text style={styles.officerRejectBtnText}>✕ Reject</Text>
                    </TouchableOpacity>
                  )}

                  {report.status !== 'Resolved' && (
                    <TouchableOpacity
                      style={styles.officerResolveBtn}
                      activeOpacity={0.8}
                      onPress={() => handleUpdateStatus(report.id, 'Resolved')}
                      disabled={isUpdatingStatus}
                    >
                      <Text style={styles.officerResolveBtnText}>🏁 Resolve</Text>
                    </TouchableOpacity>
                  )}

                  {report.status === 'Resolved' && (
                    <View style={styles.officerResolvedNotice}>
                      <Text style={styles.officerResolvedNoticeText}>✓ Officially Resolved</Text>
                    </View>
                  )}

                  {report.status === 'Rejected' && (
                    <View style={styles.officerRejectedNotice}>
                      <Text style={styles.officerRejectedNoticeText}>✕ Rejected by Officer</Text>
                      <TouchableOpacity
                        style={styles.officerReopenLink}
                        onPress={() => handleUpdateStatus(report.id, 'In Progress')}
                      >
                        <Text style={styles.officerReopenLinkText}>Reopen / Accept</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.officerInspectBtn}
                    onPress={() => handleOpenReportDetails(report.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.officerInspectText}>Details →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Administrative Governance Note */}
        <View style={styles.transparencyCard}>
          <View style={styles.transparencyHeaderRow}>
            <Text style={styles.transparencyIcon}>🛡️</Text>
            <Text style={styles.transparencyTitle}>Ward Officer Governance Protocol</Text>
          </View>
          <Text style={styles.transparencyText}>
            As the designated Ward Officer for {officerWard}, all status updates synchronize directly
            with municipal persistence. Accepted issues are dispatched to public works crews, and community highlights
            escalate inspection priority automatically.
          </Text>
        </View>
      </ScrollView>
    );
  };

  /**
   * Home Screen Feed & Impact Dashboard
   */
  const renderHomeScreen = () => {
    const reportedCount = reports.filter((r) => r.status === 'Reported').length;
    const resolvedCount = reports.filter((r) => r.status === 'Resolved').length;
    const underReviewCount = reports.filter((r) => r.status === 'Under Review').length;

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingReports}
            onRefresh={() => fetchReports(true)}
            colors={[THEME.colors.brandTeal]}
            tintColor={THEME.colors.brandTeal}
          />
        }
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeftCol}>
            <View style={styles.brandRow}>
              <View style={styles.brandLogo}>
                <Text style={styles.brandLogoIcon}>🔍</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>CivicLens AI</Text>
                <View style={styles.locationContainer}>
                  <Text style={styles.locationPinIcon}>📍</Text>
                  <Text style={styles.locationSubtitle}>
                    {currentUser?.ward || 'Downtown Ward 14'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.headerRightActions}>
            {currentUser && (
              <TouchableOpacity
                style={styles.userRoleBadge}
                onPress={handleSignOut}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="User profile, tap to sign out"
              >
                <Text style={styles.userRoleBadgeIcon}>
                  {currentUser.role === 'Ward Officer' ? '🛡️' : '👤'}
                </Text>
                <View style={styles.userBadgeTextCol}>
                  <Text style={styles.userBadgeName} numberOfLines={1}>
                    {currentUser.name}
                  </Text>
                  <Text style={styles.userBadgeRole}>{currentUser.role}</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Refresh reports"
              activeOpacity={0.7}
              style={styles.notificationButton}
              onPress={() => fetchReports(true)}
            >
              <Text style={styles.bellIcon}>🔄</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Backend Unreachable / Error Banner */}
        {backendError && (
          <View style={styles.backendErrorBanner}>
            <View style={styles.backendErrorHeader}>
              <Text style={styles.backendErrorIcon}>⚠️</Text>
              <Text style={styles.backendErrorTitle}>Live Backend Notice</Text>
            </View>
            <Text style={styles.backendErrorText}>{backendError}</Text>
            <TouchableOpacity
              style={styles.retryBackendBtn}
              activeOpacity={0.8}
              onPress={() => fetchReports(false)}
            >
              <Text style={styles.retryBackendBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hero / Welcome Banner */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <View style={styles.livePulseDot} />
              <Text style={styles.heroBadgeText}>AI-POWERED CIVIC INFRASTRUCTURE</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Transform your city,{'\n'}one report at a time.</Text>
          <Text style={styles.heroSubtitle}>
            Capture neighborhood issues with real-time AI classification and direct municipal routing.
          </Text>

          <TouchableOpacity
            style={styles.primaryActionButton}
            activeOpacity={0.85}
            onPress={() => {
              setSubmittedReport(null);
              setIsReportingFlow(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Report an Issue"
          >
            <View style={styles.cameraIconContainer}>
              <Text style={styles.cameraIcon}>📸</Text>
            </View>
            <Text style={styles.primaryActionText}>Report an Issue</Text>
            <Text style={styles.actionArrowIcon}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Impact Summary Section */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Community Impact</Text>
            <Text style={styles.sectionCaption}>Live ward telemetry & resolution status</Text>
          </View>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{reports.length} Total</Text>
          </View>
        </View>

        <View style={styles.impactContainer}>
          <View style={styles.impactCard}>
            <View style={[styles.impactIndicator, { backgroundColor: '#38BDF8' }]} />
            <Text style={styles.impactNumber}>{reports.length}</Text>
            <Text style={styles.impactLabel}>Total Reported</Text>
          </View>
          <View style={styles.impactCard}>
            <View style={[styles.impactIndicator, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.impactNumber}>{reportedCount + underReviewCount}</Text>
            <Text style={styles.impactLabel}>Active Issues</Text>
          </View>
          <View style={styles.impactCard}>
            <View style={[styles.impactIndicator, { backgroundColor: '#10B981' }]} />
            <Text style={styles.impactNumber}>{resolvedCount}</Text>
            <Text style={styles.impactLabel}>Resolved</Text>
          </View>
        </View>

        {/* Nearby Issues Section */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Live Issue Feed</Text>
            <Text style={styles.sectionCaption}>Connected to CivicLens FastAPI service</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => fetchReports(true)}
            style={styles.refreshFeedBtn}
          >
            <Text style={styles.seeAllText}>Refresh ↻</Text>
          </TouchableOpacity>
        </View>

        {/* Loading State Skeletons */}
        {isLoadingReports && renderLoadingSkeletons()}

        {/* Empty State */}
        {!isLoadingReports && reports.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyIcon}>🌱</Text>
            </View>
            <Text style={styles.emptyTitle}>No Civic Reports Found</Text>
            <Text style={styles.emptySubtitle}>
              Your neighborhood looks all clear! Be the first citizen to report an issue when you spot one.
            </Text>
            <TouchableOpacity
              style={styles.emptyActionButton}
              onPress={() => setIsReportingFlow(true)}
            >
              <Text style={styles.emptyActionText}>Report First Issue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reports List */}
        {!isLoadingReports && reports.length > 0 && (
          <View style={styles.reportsList}>
            {reports.map((report) => renderReportCard(report))}
          </View>
        )}

        {/* Transparency Card */}
        <View style={styles.transparencyCard}>
          <View style={styles.transparencyHeaderRow}>
            <Text style={styles.transparencyIcon}>🛡️</Text>
            <Text style={styles.transparencyTitle}>Verified Civic Governance</Text>
          </View>
          <Text style={styles.transparencyText}>
            Reports synchronize directly with the FastAPI backend service. AI urgency suggestions
            are currently evaluated via the client simulation layer and will link to Gemma inference in future milestones.
          </Text>
        </View>
      </ScrollView>
    );
  };

  /**
   * "My Reports" Screen with Filter Tabs
   */
  const renderMyReportsScreen = () => {
    const filteredReports = reports.filter((r) => {
      if (reportFilter === 'All') return true;
      return r.status === reportFilter;
    });

    return (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingReports}
            onRefresh={() => fetchReports(true)}
            colors={[THEME.colors.brandTeal]}
            tintColor={THEME.colors.brandTeal}
          />
        }
      >
        {/* Header */}
        <View style={styles.myReportsHeader}>
          <Text style={styles.myReportsTitle}>My Civic Reports</Text>
          <Text style={styles.myReportsSubtitle}>
            Track real-time progress, updates, and municipal response stages.
          </Text>
        </View>

        {/* Status Filter Pills */}
        <View style={styles.filterPillsRow}>
          {(['All', 'Reported', 'Under Review', 'Resolved'] as const).map((tab) => {
            const isSelected = reportFilter === tab;
            const count =
              tab === 'All' ? reports.length : reports.filter((r) => r.status === tab).length;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.filterPill, isSelected && styles.filterPillActive]}
                onPress={() => setReportFilter(tab)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  {tab} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Loading State */}
        {isLoadingReports && renderLoadingSkeletons()}

        {/* Empty State */}
        {!isLoadingReports && filteredReports.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyIcon}>📋</Text>
            </View>
            <Text style={styles.emptyTitle}>No {reportFilter === 'All' ? '' : reportFilter} Reports</Text>
            <Text style={styles.emptySubtitle}>
              {reportFilter === 'All'
                ? "You haven't submitted any civic reports yet. Help make your streets safer today."
                : `No reports currently in "${reportFilter}" state.`}
            </Text>
            <TouchableOpacity
              style={styles.emptyActionButton}
              onPress={() => setIsReportingFlow(true)}
            >
              <Text style={styles.emptyActionText}>Submit New Report</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Filtered Reports List */}
        {!isLoadingReports && filteredReports.length > 0 && (
          <View style={styles.reportsList}>
            {filteredReports.map((report) => renderReportCard(report))}
          </View>
        )}
      </ScrollView>
    );
  };

  /**
   * "Explore Community Map & Heatmap" Screen
   */
  const renderExploreScreen = () => (
    <CivicHeatmapScreen
      reports={reports}
      isLoading={isLoadingReports}
      onRefresh={() => fetchReports(true)}
      onSelectReport={(reportId) => handleOpenReportDetails(reportId)}
      onStartReportFromMap={(lat, lng, addressHint) => {
        resetForm();
        setLatitude(lat);
        setLongitude(lng);
        if (addressHint) setLocation(addressHint);
        setIsReportingFlow(true);
      }}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {!currentUser ? (
          renderLoginScreen()
        ) : (
          <>
            {/* Main Content Area */}
            <View style={styles.mainContent}>
              {isReportingFlow
                ? renderReportScreen()
                : activeTab === 'home'
                ? currentUser?.role === 'Ward Officer'
                  ? renderWardOfficerDashboard()
                  : renderHomeScreen()
                : activeTab === 'explore'
                ? renderExploreScreen()
                : renderMyReportsScreen()}
            </View>

            {/* Bottom Navigation Bar */}
            <View style={styles.bottomNav}>
              <TouchableOpacity
                style={styles.navItem}
                activeOpacity={0.7}
                onPress={() => {
                  setIsReportingFlow(false);
                  setActiveTab('home');
                }}
              >
                <Text
                  style={[
                    styles.navIcon,
                    activeTab === 'home' && !isReportingFlow && styles.navIconActive,
                  ]}
                >
                  {currentUser?.role === 'Ward Officer' ? '🛡️' : '🏛️'}
                </Text>
                <Text
                  style={[
                    styles.navLabel,
                    activeTab === 'home' && !isReportingFlow && styles.navLabelActive,
                  ]}
                >
                  {currentUser?.role === 'Ward Officer' ? 'Command' : 'Home'}
                </Text>
                {activeTab === 'home' && !isReportingFlow && (
                  <View style={styles.activeTabIndicator} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.navItem}
                activeOpacity={0.7}
                onPress={() => {
                  setIsReportingFlow(false);
                  setActiveTab('explore');
                }}
              >
                <Text
                  style={[
                    styles.navIcon,
                    activeTab === 'explore' && !isReportingFlow && styles.navIconActive,
                  ]}
                >
                  🗺️
                </Text>
                <Text
                  style={[
                    styles.navLabel,
                    activeTab === 'explore' && !isReportingFlow && styles.navLabelActive,
                  ]}
                >
                  Heatmap
                </Text>
                {activeTab === 'explore' && !isReportingFlow && (
                  <View style={styles.activeTabIndicator} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.navItem}
                activeOpacity={0.7}
                onPress={() => {
                  setIsReportingFlow(false);
                  setActiveTab('reports');
                }}
              >
                <Text
                  style={[
                    styles.navIcon,
                    activeTab === 'reports' && !isReportingFlow && styles.navIconActive,
                  ]}
                >
                  📑
                </Text>
                <Text
                  style={[
                    styles.navLabel,
                    activeTab === 'reports' && !isReportingFlow && styles.navLabelActive,
                  ]}
                >
                  {currentUser?.role === 'Ward Officer' ? 'All Reports' : 'My Reports'}
                </Text>
                {activeTab === 'reports' && !isReportingFlow && (
                  <View style={styles.activeTabIndicator} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Report Details & Status Management Modal */}
        <Modal
          visible={Boolean(selectedReportId)}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedReportId(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {/* Drag Handle Indicator */}
              <View style={styles.modalDragHandleContainer}>
                <View style={styles.modalDragHandle} />
              </View>

              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTitleGroup}>
                  <Text style={styles.modalHeaderBadge}>
                    {detailedReport ? detailedReport.referenceNo : 'Report Details'}
                  </Text>
                  <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                    {detailedReport?.title || 'Report Details'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setSelectedReportId(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close Details Modal"
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {isLoadingDetails ? (
                <View style={styles.modalLoadingBox}>
                  <ActivityIndicator size="small" color={THEME.colors.brandTeal} />
                  <Text style={styles.modalLoadingText}>Loading report details from backend...</Text>
                </View>
              ) : detailsError && !detailedReport ? (
                <View style={styles.modalErrorBox}>
                  <Text style={styles.modalErrorText}>⚠️ {detailsError}</Text>
                  <TouchableOpacity
                    style={styles.retryBackendBtn}
                    onPress={() => selectedReportId && handleOpenReportDetails(selectedReportId)}
                  >
                    <Text style={styles.retryBackendBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : detailedReport ? (
                <ScrollView
                  style={styles.modalScrollArea}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {detailsError && (
                    <View style={styles.backendErrorBanner}>
                      <Text style={styles.backendErrorText}>⚠️ {detailsError}</Text>
                    </View>
                  )}

                  {/* Status Banner */}
                  <View style={styles.modalStatusRow}>
                    <Text style={styles.modalSectionLabel}>CURRENT WORKFLOW STATUS</Text>
                    {renderStatusBadge(detailedReport.status)}
                  </View>

                  {/* Category & Location Details */}
                  <View style={styles.modalDetailGroup}>
                    <Text style={styles.modalDetailKey}>Category</Text>
                    <Text style={styles.modalDetailValue}>
                      {detailedReport.categoryIcon} {detailedReport.category}
                    </Text>
                  </View>

                  <View style={styles.modalDetailGroup}>
                    <Text style={styles.modalDetailKey}>Location</Text>
                    <Text style={styles.modalDetailValue}>📍 {detailedReport.location}</Text>
                  </View>

                  <View style={styles.modalDetailGroup}>
                    <Text style={styles.modalDetailKey}>Reported On</Text>
                    <Text style={styles.modalDetailValue}>🕒 {detailedReport.createdAt}</Text>
                  </View>

                  {/* Priority */}
                  {detailedReport.suggestedPriority && (
                    <View style={styles.modalDetailGroup}>
                      <Text style={styles.modalDetailKey}>Priority Level</Text>
                      <View style={{ marginTop: 4 }}>
                        {renderPriorityBadge(detailedReport.suggestedPriority)}
                      </View>
                    </View>
                  )}

                  {/* Full Description */}
                  <View style={styles.modalDetailGroup}>
                    <Text style={styles.modalDetailKey}>Full Description</Text>
                    <Text style={styles.modalDescriptionText}>{detailedReport.description}</Text>
                  </View>

                  {/* Attached photo if present */}
                  {detailedReport.imageUri && (
                    <View style={styles.modalDetailGroup}>
                      <Text style={styles.modalDetailKey}>Attached Photo</Text>
                      <Image
                        source={{ uri: detailedReport.imageUri }}
                        style={styles.modalAttachedImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {/* AI Analysis Snapshot if present */}
                  {detailedReport.aiAnalysis && (
                    <View style={styles.modalAiSection}>
                      <Text style={styles.modalAiTitle}>✨ AI ADVISORY SUMMARY (DEMO)</Text>
                      <Text style={styles.modalAiSummary}>{detailedReport.aiAnalysis.summary}</Text>
                      <Text style={styles.modalAiAction}>
                        👉 {detailedReport.aiAnalysis.recommendedNextAction}
                      </Text>
                    </View>
                  )}

                  {/* Status Update Control (Connected to PATCH /api/reports/{id}/status) */}
                  <View style={styles.statusUpdateContainer}>
                    <Text style={styles.statusUpdateHeader}>
                      {currentUser?.role === 'Ward Officer'
                        ? 'OFFICIAL WARD OFFICER ACTIONS'
                        : 'UPDATE REPORT STATUS'}
                    </Text>
                    <Text style={styles.statusUpdateSub}>
                      {currentUser?.role === 'Ward Officer'
                        ? 'Exercise municipal authority to accept, reject, or resolve this civic issue:'
                        : 'Update the workflow stage on the live backend:'}
                    </Text>

                    {currentUser?.role === 'Ward Officer' ? (
                      <View style={styles.officerDecisionBtnGrid}>
                        <TouchableOpacity
                          style={[
                            styles.officerModalActionBtn,
                            { backgroundColor: '#0D9488' },
                            detailedReport.status === 'In Progress' && { opacity: 0.5 },
                          ]}
                          disabled={detailedReport.status === 'In Progress' || isUpdatingStatus}
                          onPress={() => handleUpdateStatus('In Progress')}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.officerModalActionText}>✓ Accept Issue (In Progress)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.officerModalActionBtn,
                            { backgroundColor: '#EF4444' },
                            detailedReport.status === 'Rejected' && { opacity: 0.5 },
                          ]}
                          disabled={detailedReport.status === 'Rejected' || isUpdatingStatus}
                          onPress={() => handleUpdateStatus('Rejected')}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.officerModalActionText}>✕ Reject Issue</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.officerModalActionBtn,
                            { backgroundColor: '#10B981' },
                            detailedReport.status === 'Resolved' && { opacity: 0.5 },
                          ]}
                          disabled={detailedReport.status === 'Resolved' || isUpdatingStatus}
                          onPress={() => handleUpdateStatus('Resolved')}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.officerModalActionText}>🏁 Mark Resolved</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.officerModalActionBtn,
                            { backgroundColor: '#4F46E5' },
                            detailedReport.status === 'Under Review' && { opacity: 0.5 },
                          ]}
                          disabled={detailedReport.status === 'Under Review' || isUpdatingStatus}
                          onPress={() => handleUpdateStatus('Under Review')}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.officerModalActionText}>🔍 Put Under Review</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.statusButtonRow}>
                        {(['Reported', 'Under Review', 'In Progress', 'Resolved', 'Rejected'] as ReportStatus[]).map((st) => {
                          const isCurrent = detailedReport.status === st;
                          return (
                            <TouchableOpacity
                              key={st}
                              style={[
                                styles.statusOptionButton,
                                isCurrent && styles.statusOptionButtonActive,
                              ]}
                              disabled={isCurrent || isUpdatingStatus}
                              onPress={() => handleUpdateStatus(st)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.statusOptionText,
                                  isCurrent && styles.statusOptionTextActive,
                                ]}
                              >
                                {st}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {isUpdatingStatus && (
                      <View style={styles.statusUpdatingRow}>
                        <ActivityIndicator size="small" color={THEME.colors.brandTeal} />
                        <Text style={styles.statusUpdatingText}>Updating status on backend...</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
              ) : null}

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalClosePrimaryBtn}
                  onPress={() => setSelectedReportId(null)}
                >
                  <Text style={styles.modalClosePrimaryBtnText}>Close Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 0,
  },
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  mainContent: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: THEME.colors.brandTeal,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: THEME.colors.brandTeal,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  brandLogoIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    letterSpacing: -0.4,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  locationPinIcon: {
    fontSize: 11,
    marginRight: 3,
  },
  locationSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.brandTeal,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    shadowColor: THEME.colors.primaryNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  bellIcon: {
    fontSize: 18,
  },

  /* Hero Card */
  heroCard: {
    backgroundColor: THEME.colors.primaryNavy,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: THEME.colors.primaryNavy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 148, 136, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.4)',
    gap: 6,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2DD4BF',
  },
  heroBadgeText: {
    color: '#2DD4BF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 33,
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 21,
    marginBottom: 22,
  },
  primaryActionButton: {
    backgroundColor: THEME.colors.brandTeal,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: THEME.colors.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  cameraIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cameraIcon: {
    fontSize: 16,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  actionArrowIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  /* Section Headers */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    letterSpacing: -0.3,
  },
  sectionCaption: {
    fontSize: 12,
    color: THEME.colors.slateMuted,
    marginTop: 2,
  },
  sectionBadge: {
    backgroundColor: THEME.colors.tealSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.tealBorder,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.tealDark,
  },
  refreshFeedBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.brandTeal,
  },

  /* Impact Summary Cards */
  impactContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 26,
    gap: 10,
  },
  impactCard: {
    flex: 1,
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    shadowColor: THEME.colors.primaryNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  impactIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  impactNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.colors.primaryNavy,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  impactLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.slateMuted,
    textAlign: 'center',
  },

  /* Reports List */
  reportsList: {
    gap: 14,
    marginBottom: 24,
  },
  reportCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    shadowColor: THEME.colors.primaryNavy,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  reportCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconAndTitle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 10,
  },
  categoryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: THEME.colors.tealSoft,
    borderWidth: 1,
    borderColor: THEME.colors.tealBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryIcon: {
    fontSize: 20,
  },
  reportTitleArea: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    gap: 6,
    flexWrap: 'wrap',
  },
  reportRefTag: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.tealDark,
    backgroundColor: THEME.colors.tealSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.colors.tealBorder,
  },
  reportCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.slateMuted,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.primaryNavy,
    lineHeight: 21,
  },
  reportDescriptionPreview: {
    fontSize: 13,
    color: '#475569',
    marginTop: 8,
    lineHeight: 19,
  },
  cardPriorityRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  reportCardImageWrapper: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    height: 150,
    backgroundColor: '#E2E8F0',
    position: 'relative',
  },
  reportCardImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlayTag: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  imageOverlayTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  /* Badges */
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  priorityBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  /* Card Divider & Footer */
  cardDivider: {
    height: 1,
    backgroundColor: THEME.colors.borderSubtle,
    marginVertical: 12,
  },
  reportCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  footerPinIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  footerLocationText: {
    fontSize: 12,
    color: THEME.colors.slateMuted,
    fontWeight: '600',
  },
  verifiedTag: {
    backgroundColor: THEME.colors.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '600',
    color: THEME.colors.slateLight,
  },
  cardTapPrompt: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
  },
  cardTapPromptText: {
    fontSize: 11,
    color: THEME.colors.brandTeal,
    fontWeight: '700',
  },
  cardTapArrow: {
    fontSize: 12,
    color: THEME.colors.brandTeal,
    fontWeight: '800',
  },

  /* Loading Skeleton Styles */
  skeletonContainer: {
    gap: 14,
    marginBottom: 20,
  },
  skeletonCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  skeletonHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  skeletonIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    marginRight: 12,
  },
  skeletonTitleGroup: {
    flex: 1,
    gap: 6,
  },
  skeletonTag: {
    width: 70,
    height: 12,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  skeletonLineLong: {
    width: '80%',
    height: 16,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  skeletonBadge: {
    width: 64,
    height: 22,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  skeletonBodyLine: {
    width: '100%',
    height: 12,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    marginBottom: 6,
  },
  skeletonBodyLineShort: {
    width: '60%',
    height: 12,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  skeletonFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  skeletonPill: {
    width: 80,
    height: 12,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },

  /* Transparency Card */
  transparencyCard: {
    backgroundColor: THEME.colors.tealSoft,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.colors.tealBorder,
  },
  transparencyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  transparencyIcon: {
    fontSize: 16,
  },
  transparencyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.tealDark,
  },
  transparencyText: {
    fontSize: 12,
    color: '#115E59',
    lineHeight: 18,
  },

  /* "My Reports" Screen */
  myReportsHeader: {
    marginBottom: 16,
  },
  myReportsTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  myReportsSubtitle: {
    fontSize: 13,
    color: THEME.colors.slateMuted,
    lineHeight: 19,
  },
  filterPillsRow: {
    flexDirection: 'row',
    marginBottom: 18,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  filterPillActive: {
    backgroundColor: THEME.colors.primaryNavy,
    borderColor: THEME.colors.primaryNavy,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.slateMuted,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },

  /* Form Screen Styles */
  formScrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 40,
  },
  formTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  backButtonIcon: {
    fontSize: 18,
    color: THEME.colors.brandTeal,
    fontWeight: '800',
    marginRight: 4,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.brandTeal,
  },
  formCategoryBadge: {
    backgroundColor: THEME.colors.tealSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.colors.tealBorder,
  },
  formCategoryBadgeText: {
    color: THEME.colors.tealDark,
    fontSize: 11,
    fontWeight: '800',
  },
  formHeaderSection: {
    marginBottom: 18,
  },
  formScreenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  formScreenSubtitle: {
    fontSize: 14,
    color: THEME.colors.slateMuted,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.navyLight,
    marginBottom: 6,
  },
  editableHint: {
    fontSize: 11,
    color: THEME.colors.brandTeal,
    fontWeight: '700',
    backgroundColor: THEME.colors.tealSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  requiredAsterisk: {
    color: '#EF4444',
  },
  fieldHint: {
    fontSize: 12,
    color: THEME.colors.slateMuted,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: THEME.colors.primaryNavy,
  },
  textAreaInput: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: THEME.colors.primaryNavy,
    minHeight: 110,
  },
  inputErrorBorder: {
    borderColor: '#EF4444',
    backgroundColor: '#FFF8F8',
  },
  errorCaptionText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },

  /* Categories Grid */
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  categoryChipSelected: {
    backgroundColor: THEME.colors.brandTeal,
    borderColor: THEME.colors.brandTeal,
  },
  categoryChipIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  categoryChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  categoryChipLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* Photo Attachment */
  photoUploadArea: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoUploadIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.colors.tealSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  photoUploadIcon: {
    fontSize: 22,
  },
  photoUploadTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.brandTeal,
    marginBottom: 2,
  },
  photoUploadSubtitle: {
    fontSize: 12,
    color: THEME.colors.slateLight,
  },
  photoAttachedBox: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  photoPreview: {
    width: '100%',
    height: 190,
    borderRadius: 12,
  },
  photoActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  changePhotoBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  changePhotoText: {
    color: THEME.colors.brandTeal,
    fontSize: 13,
    fontWeight: '700',
  },
  removePhotoBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  removePhotoText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },

  /* AI Analysis Section */
  aiSectionContainer: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: THEME.colors.tealBorder,
    marginBottom: 22,
    shadowColor: THEME.colors.brandTeal,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  aiSectionHeader: {
    marginBottom: 12,
  },
  aiHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: THEME.colors.tealSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  aiIconSparkle: {
    fontSize: 20,
  },
  aiLabelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
  },
  aiDemoTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  aiDemoTagText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  aiSectionSubtitle: {
    fontSize: 12,
    color: THEME.colors.slateMuted,
    marginTop: 2,
  },
  aiErrorBanner: {
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginBottom: 12,
  },
  aiErrorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  aiLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.tealSoft,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99F6E4',
    gap: 10,
  },
  aiLoadingText: {
    flex: 1,
    fontSize: 13,
    color: THEME.colors.tealDark,
    fontWeight: '600',
  },
  analyzeButton: {
    backgroundColor: THEME.colors.tealSoft,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: THEME.colors.brandTeal,
    gap: 8,
  },
  analyzeButtonIcon: {
    fontSize: 16,
  },
  analyzeButtonText: {
    color: THEME.colors.brandTeal,
    fontSize: 14,
    fontWeight: '800',
  },

  /* AI Result Card */
  aiResultCard: {
    marginTop: 14,
    backgroundColor: THEME.colors.background,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  aiDisclaimerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 10,
  },
  aiDisclaimerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  aiResultHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiTimeText: {
    fontSize: 11,
    color: THEME.colors.slateLight,
    fontWeight: '600',
  },
  aiResultFieldGroup: {
    marginBottom: 10,
  },
  aiResultFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.slateMuted,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  suggestedCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestedCategoryText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
  },
  categoryAppliedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryAppliedText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '700',
  },
  applyCategoryBtn: {
    backgroundColor: THEME.colors.brandTeal,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  applyCategoryBtnText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  aiSummaryContent: {
    fontSize: 13,
    color: THEME.colors.navyLight,
    lineHeight: 19,
    fontWeight: '500',
  },
  aiExplanationContent: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  aiActionContent: {
    fontSize: 12,
    color: THEME.colors.tealDark,
    fontWeight: '700',
    lineHeight: 18,
  },
  aiProviderDisclaimer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.slateBorder,
  },
  aiProviderDisclaimerText: {
    fontSize: 10,
    color: THEME.colors.slateLight,
    lineHeight: 14,
    fontStyle: 'italic',
  },

  /* Form Actions */
  formActionArea: {
    marginTop: 10,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: THEME.colors.brandTeal,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.colors.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  cancelLinkText: {
    color: THEME.colors.slateMuted,
    fontSize: 14,
    fontWeight: '600',
  },

  /* Success Screen */
  successScrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: 'center',
  },
  successCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    shadowColor: THEME.colors.primaryNavy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  successIconBubble: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  successIconCheck: {
    fontSize: 32,
    color: '#15803D',
    fontWeight: '800',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    marginBottom: 6,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: THEME.colors.slateMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
  },
  referenceBadgeContainer: {
    backgroundColor: THEME.colors.tealSoft,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    alignItems: 'center',
    marginBottom: 18,
    width: '100%',
  },
  referenceLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.tealDark,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  referenceCode: {
    fontSize: 26,
    fontWeight: '900',
    color: THEME.colors.brandTeal,
    letterSpacing: 1.5,
  },
  summaryBox: {
    width: '100%',
    backgroundColor: THEME.colors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    marginBottom: 18,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryKey: {
    fontSize: 13,
    color: THEME.colors.slateMuted,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 13,
    color: THEME.colors.primaryNavy,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryAiSection: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.slateBorder,
  },
  aiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryAiHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.brandTeal,
    letterSpacing: 0.6,
  },
  summaryAiNote: {
    fontSize: 11,
    color: THEME.colors.tealDark,
    marginTop: 4,
    fontWeight: '600',
  },
  summaryImagePreviewWrapper: {
    marginTop: 6,
  },
  summaryAttachedImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginTop: 6,
  },
  successButtonActions: {
    width: '100%',
    gap: 10,
  },
  secondaryOutlineButton: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: THEME.colors.brandTeal,
    alignItems: 'center',
  },
  secondaryOutlineButtonText: {
    color: THEME.colors.brandTeal,
    fontSize: 14,
    fontWeight: '700',
  },

  /* Placeholder Screens */
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: THEME.colors.background,
  },
  placeholderIconContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: THEME.colors.tealSoft,
    borderWidth: 1.5,
    borderColor: THEME.colors.tealBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  placeholderIcon: {
    fontSize: 40,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderSubtitle: {
    fontSize: 14,
    color: THEME.colors.slateMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  exploreStatsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 26,
  },
  exploreStatBox: {
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    alignItems: 'center',
  },
  exploreStatVal: {
    fontSize: 20,
    fontWeight: '900',
    color: THEME.colors.brandTeal,
  },
  exploreStatLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.slateMuted,
  },
  placeholderButton: {
    backgroundColor: THEME.colors.brandTeal,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    shadowColor: THEME.colors.brandTeal,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  placeholderButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  /* Bottom Navigation */
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surface,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.slateBorder,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 12 : 18,
    justifyContent: 'space-around',
    shadowColor: THEME.colors.primaryNavy,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    position: 'relative',
    paddingVertical: 4,
  },
  navIcon: {
    fontSize: 20,
    marginBottom: 4,
    opacity: 0.45,
  },
  navIconActive: {
    opacity: 1,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.slateMuted,
  },
  navLabelActive: {
    color: THEME.colors.brandTeal,
    fontWeight: '800',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: -6,
    width: 24,
    height: 3,
    backgroundColor: THEME.colors.brandTeal,
    borderRadius: 2,
  },

  /* Backend Error & Status Banners */
  backendErrorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  backendErrorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  backendErrorIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  backendErrorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  backendErrorText: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 18,
    marginBottom: 8,
  },
  retryBackendBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryBackendBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Empty States */
  emptyContainer: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.tealSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: THEME.colors.slateMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  emptyActionButton: {
    backgroundColor: THEME.colors.brandTeal,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Submit button disabled state */
  submitButtonDisabled: {
    opacity: 0.65,
  },

  /* Report Details Bottom Sheet Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalDragHandleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 6,
  },
  modalDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  modalHeaderTitleGroup: {
    flex: 1,
    marginRight: 12,
  },
  modalHeaderBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.brandTeal,
    marginBottom: 2,
  },
  modalHeaderTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.slateMuted,
  },
  modalScrollArea: {
    maxHeight: 480,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  modalLoadingText: {
    fontSize: 13,
    color: THEME.colors.brandTeal,
    fontWeight: '600',
  },
  modalErrorBox: {
    padding: 24,
    alignItems: 'center',
  },
  modalErrorText: {
    fontSize: 13,
    color: '#B91C1C',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.slateMuted,
    letterSpacing: 0.5,
  },
  modalDetailGroup: {
    marginBottom: 14,
  },
  modalDetailKey: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.slateLight,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalDetailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primaryNavy,
  },
  modalDescriptionText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  modalAttachedImage: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    marginTop: 6,
  },
  modalAiSection: {
    backgroundColor: THEME.colors.tealSoft,
    borderColor: THEME.colors.tealBorder,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginVertical: 12,
  },
  modalAiTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.tealDark,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  modalAiSummary: {
    fontSize: 12,
    color: '#134E4A',
    lineHeight: 18,
    marginBottom: 6,
  },
  modalAiAction: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.brandTeal,
  },
  statusUpdateContainer: {
    backgroundColor: THEME.colors.background,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  statusUpdateHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statusUpdateSub: {
    fontSize: 12,
    color: THEME.colors.slateMuted,
    marginBottom: 10,
  },
  statusButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusOptionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  statusOptionButtonActive: {
    backgroundColor: THEME.colors.brandTeal,
    borderColor: THEME.colors.brandTeal,
  },
  statusOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  statusOptionTextActive: {
    color: '#FFFFFF',
  },
  statusUpdatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 6,
  },
  statusUpdatingText: {
    fontSize: 11,
    color: THEME.colors.brandTeal,
    fontWeight: '600',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalClosePrimaryBtn: {
    backgroundColor: THEME.colors.primaryNavy,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalClosePrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  /* Header User Role Badge */
  headerLeftCol: {
    flex: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: 140,
  },
  userRoleBadgeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  userBadgeTextCol: {
    flexShrink: 1,
  },
  userBadgeName: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primaryNavy,
  },
  userBadgeRole: {
    fontSize: 9,
    fontWeight: '600',
    color: THEME.colors.brandTeal,
  },

  /* Login Screen Styles */
  loginScrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  loginBrandCard: {
    alignItems: 'center',
    marginBottom: 24,
  },
  loginBrandIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: THEME.colors.brandTeal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.colors.brandTeal,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 14,
  },
  loginBrandIcon: {
    fontSize: 32,
  },
  loginLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 148, 136, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.25)',
  },
  loginLiveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.brandTeal,
    letterSpacing: 0.8,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: THEME.colors.primaryNavy,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  loginSubtitle: {
    fontSize: 13,
    color: THEME.colors.slateMuted,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 16,
  },
  loginCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  loginCardHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 14,
    textAlign: 'center',
  },
  roleTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
    gap: 4,
  },
  roleTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    position: 'relative',
  },
  roleTabButtonActive: {
    backgroundColor: THEME.colors.surface,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  roleTabIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  roleTabTextActive: {
    color: THEME.colors.primaryNavy,
    fontWeight: '800',
  },
  roleTabIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: THEME.colors.brandTeal,
  },
  loginErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    gap: 8,
  },
  loginErrorIcon: {
    fontSize: 14,
  },
  loginErrorMsg: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  loginFieldGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  loginInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
  },
  loginInputIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  loginTextInput: {
    flex: 1,
    fontSize: 14,
    color: THEME.colors.primaryNavy,
    paddingVertical: 0,
  },
  showPasswordBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  showPasswordText: {
    fontSize: 12,
    color: THEME.colors.brandTeal,
    fontWeight: '700',
  },
  loginSubmitBtn: {
    backgroundColor: THEME.colors.brandTeal,
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    shadowColor: THEME.colors.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  loginBtnInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loginSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  loginBtnArrow: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  loginDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
    gap: 10,
  },
  loginDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  loginDividerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  demoButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  demoPillButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  demoPillButtonOfficial: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },
  demoPillIcon: {
    fontSize: 20,
  },
  demoPillTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
  },
  demoPillSub: {
    fontSize: 10,
    color: '#64748B',
  },
  guestAccessLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  guestAccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.slateMuted,
  },
  loginFooterBadge: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 12,
  },
  loginFooterText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },

  /* Auth Mode Switcher (Sign In vs Create Account) */
  authModeSwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  authModeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  authModeButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  authModeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  authModeTextActive: {
    color: THEME.colors.primaryNavy,
    fontWeight: '800',
  },

  /* GPS Coordinates Attached Badge */
  gpsCoordinatesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  gpsCoordinatesBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  gpsRemoveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },

  /* Photo Choice Grid (Camera vs Gallery) */
  photoChoiceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  photoChoiceBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: THEME.colors.slateBorder,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* GPS Locator Button */
  detectGpsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  detectGpsInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detectGpsIcon: {
    fontSize: 13,
  },
  detectGpsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },
  gpsBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gpsDot: {
    fontSize: 10,
  },

  /* AI Duplicate Detection Card */
  duplicateAlertCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#B45309',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  duplicateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  duplicateIconBubble: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duplicateIcon: {
    fontSize: 18,
  },
  duplicateAlertTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
  },
  duplicateAlertSub: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 1,
  },
  duplicateIssueBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 10,
  },
  duplicateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  duplicateRefTag: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  duplicateStatusTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  duplicateHighlightsTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D9488',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  duplicateTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    marginBottom: 2,
  },
  duplicateLocationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  duplicateDescPreview: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
  },
  duplicateAdvisoryText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#78350F',
    marginBottom: 12,
  },
  duplicateActionRow: {
    gap: 8,
  },
  duplicateHighlightBtn: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  duplicateHighlightBtnIcon: {
    fontSize: 16,
  },
  duplicateHighlightBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  duplicateDismissBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  duplicateDismissText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textDecorationLine: 'underline',
  },

  /* Ward Officer Administrative Dashboard */
  officerHeroBanner: {
    backgroundColor: THEME.colors.primaryNavy,
    borderRadius: 22,
    padding: 20,
    marginBottom: 22,
    shadowColor: THEME.colors.primaryNavy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  officerHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  officerAuthTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  officerAuthTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  officerScopePills: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 2,
  },
  scopePillBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scopePillBtnActive: {
    backgroundColor: THEME.colors.brandTeal,
  },
  scopePillBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  scopePillBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  officerHeroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  officerHeroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#94A3B8',
  },
  officerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  /* Officer 5-Card Telemetry Grid */
  officerMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  officerMetricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  officerMetricCardActive: {
    borderColor: THEME.colors.brandTeal,
    backgroundColor: '#F0FDFA',
  },
  metricBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 2,
  },
  metricIcon: {
    fontSize: 18,
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.primaryNavy,
  },
  metricTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
  },
  metricSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  /* Officer Queue Filter Row */
  officerQueueFilterRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    gap: 8,
    marginBottom: 16,
  },
  officerFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
  },
  officerFilterPillActive: {
    backgroundColor: THEME.colors.primaryNavy,
    borderColor: THEME.colors.primaryNavy,
  },
  officerFilterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  officerFilterPillTextActive: {
    color: '#FFFFFF',
  },

  /* Actionable Officer Card Controls */
  officerCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.colors.slateBorder,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  officerCardMain: {
    padding: 16,
    paddingBottom: 12,
  },
  officerCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
    flexWrap: 'wrap',
  },
  highlightsBadge: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  highlightsBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  officerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexWrap: 'wrap',
  },
  officerAcceptBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  officerAcceptBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  officerRejectBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  officerRejectBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  officerResolveBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  officerResolveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  officerResolvedNotice: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  officerResolvedNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  officerRejectedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  officerRejectedNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  officerReopenLink: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  officerReopenLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
  },
  officerInspectBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  officerInspectText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },

  /* Modal Officer Decision Grid */
  officerDecisionBtnGrid: {
    gap: 8,
    marginTop: 6,
  },
  officerModalActionBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  officerModalActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
