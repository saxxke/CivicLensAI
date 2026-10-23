import React, { useState, useEffect, useCallback } from 'react';
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import {
  IssueAnalysisResult,
  IssueCategory,
  SuggestedPriority,
  issueAnalysisService,
} from './src/services/issueAnalysisService';
import {
  apiClient,
  transformBackendReport,
  API_BASE_URL,
  ApiError,
  ReportStatus,
} from './src/services/api';

type TabType = 'home' | 'explore' | 'reports';

interface IssueReportItem {
  id: string;
  referenceNo: string;
  title: string;
  category: IssueCategory;
  description: string;
  location: string;
  status: ReportStatus;
  categoryIcon: string;
  imageUri?: string | null;
  createdAt: string;
  suggestedPriority?: SuggestedPriority;
  aiAnalysis?: IssueAnalysisResult | null;
  isBackendSynced?: boolean;
}

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
    status: 'Reported',
    categoryIcon: '🚧',
    createdAt: 'Today, 10:30 AM',
  },
  {
    id: 'sample-2',
    referenceNo: 'CL-1002',
    title: 'Garbage Overflow',
    category: 'Garbage',
    description: 'Community bins spilling onto the pavement, needs scheduled pickup.',
    location: 'Market Street',
    status: 'Under Review',
    categoryIcon: '🗑️',
    createdAt: 'Yesterday, 4:15 PM',
  },
  {
    id: 'sample-3',
    referenceNo: 'CL-1003',
    title: 'Broken Streetlight',
    category: 'Broken Streetlight',
    description: 'Post pole flickering at night, creating dark spots near the park lane.',
    location: 'Park Avenue',
    status: 'Resolved',
    categoryIcon: '💡',
    createdAt: 'Oct 20, 08:00 PM',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isReportingFlow, setIsReportingFlow] = useState<boolean>(false);

  // Reports state & backend synchronization
  const [reports, setReports] = useState<IssueReportItem[]>(INITIAL_SAMPLE_REPORTS);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);
  const [isRefreshingReports, setIsRefreshingReports] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Form state
  const [category, setCategory] = useState<IssueCategory>('Road Damage');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [imageUri, setImageUri] = useState<string | null>(null);

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

  // Report Details modal state (Requirements 6 & 7)
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
      // Preserve any client-side AI analysis if present on cached item
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
   */
  const handleUpdateStatus = async (newStatus: ReportStatus) => {
    if (!detailedReport) return;
    setIsUpdatingStatus(true);

    try {
      const updatedBackend = await apiClient.updateReportStatus(detailedReport.id, newStatus);
      const transformed = transformBackendReport(updatedBackend);
      if (detailedReport.aiAnalysis) {
        transformed.aiAnalysis = detailedReport.aiAnalysis;
      }

      setDetailedReport(transformed);
      // Update in reports list as well
      setReports((prev) =>
        prev.map((item) => (item.id === detailedReport.id ? transformed : item))
      );
      Alert.alert('Status Updated', `Report ${detailedReport.id} is now "${newStatus}".`);
    } catch (err: any) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Failed to update status on the backend.';
      Alert.alert('Update Failed', msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setImageUri(null);
    setCategory('Road Damage');
    setErrors({});
    setIsAnalyzing(false);
    setAnalysisResult(null);
    setAnalysisError(null);
    setSubmitError(null);
    setIsSubmitting(false);
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          'Permission required',
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
      Alert.alert('Error', 'Unable to open gallery. Please try again.');
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
      setAnalysisError('Please provide a slightly more descriptive issue text (at least 8 characters) for meaningful AI analysis.');
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

      // Offer auto-suggested category update if different from current selection
      if (result.suggestedCategory && result.suggestedCategory !== category) {
        setCategory(result.suggestedCategory);
      }
    } catch {
      setAnalysisError('AI analysis service is temporarily unavailable. You can still submit your report manually.');
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
      // POST /api/reports
      const created = await apiClient.createReport({
        title: title.trim(),
        description: description.trim(),
        category,
        location: location.trim(),
        suggested_priority: analysisResult?.suggestedPriority || 'Medium',
        image_url: imageUri || null,
      });

      const transformed = transformBackendReport(created);
      // Attach client-side AI analysis snapshot for review display
      transformed.aiAnalysis = analysisResult;

      // Add verified created report into local state
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
    let badgeBg = '#E0F2FE';
    let badgeTextColor = '#0369A1';

    if (status === 'Reported') {
      badgeBg = '#FEF3C7';
      badgeTextColor = '#B45309';
    } else if (status === 'Under Review') {
      badgeBg = '#E0E7FF';
      badgeTextColor = '#4338CA';
    } else if (status === 'Resolved') {
      badgeBg = '#DCFCE7';
      badgeTextColor = '#15803D';
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
        <Text style={[styles.statusBadgeText, { color: badgeTextColor }]}>
          {status}
        </Text>
      </View>
    );
  };

  const renderPriorityBadge = (priority: SuggestedPriority) => {
    let bg = '#FEF3C7';
    let text = '#B45309';
    let icon = '⚡';

    if (priority === 'High') {
      bg = '#FEE2E2';
      text = '#B91C1C';
      icon = '🚨';
    } else if (priority === 'Low') {
      bg = '#F1F5F9';
      text = '#475569';
      icon = '🔹';
    }

    return (
      <View style={[styles.priorityBadge, { backgroundColor: bg }]}>
        <Text style={[styles.priorityBadgeText, { color: text }]}>
          {icon} Suggested {priority} Priority
        </Text>
      </View>
    );
  };

  // "Report an Issue" Functional Form Screen with AI Analysis
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

            <Text style={styles.successTitle}>Report Submitted!</Text>
            <Text style={styles.successSubtitle}>
              Thank you for contributing to your community. Your report has been confirmed and registered with the CivicLens backend.
            </Text>

            <View style={styles.referenceBadgeContainer}>
              <Text style={styles.referenceLabel}>REFERENCE NUMBER</Text>
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

              {submittedReport.aiAnalysis && (
                <View style={styles.summaryAiSection}>
                  <Text style={styles.summaryAiHeader}>AI SUGGESTION SNAPSHOT</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Priority:</Text>
                    <Text style={styles.summaryValue}>
                      {submittedReport.aiAnalysis.suggestedPriority}
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

            {/* Prototype notice */}
            <View style={styles.prototypeNotice}>
              <Text style={styles.prototypeNoticeTitle}>ℹ️ Local Prototype Mode</Text>
              <Text style={styles.prototypeNoticeText}>
                This submission is stored locally in this session. It has not been
                dispatched to actual municipal authorities yet.
              </Text>
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
                <Text style={styles.primaryActionText}>View on Home Screen</Text>
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

            <View style={styles.prototypeHeaderBadge}>
              <Text style={styles.prototypeBadgeText}>Local Prototype</Text>
            </View>
          </View>

          {/* Screen Title & Subtitle */}
          <View style={styles.formHeaderSection}>
            <Text style={styles.formScreenTitle}>Report an Issue</Text>
            <Text style={styles.formScreenSubtitle}>
              Help make your community better.
            </Text>
          </View>

          {/* Prototype disclaimer pill */}
          <View style={styles.prototypeDisclaimerPill}>
            <Text style={styles.disclaimerPillText}>
              📝 Reports are saved locally in this prototype demo.
            </Text>
          </View>

          {/* 1. Category Selection */}
          <View style={styles.inputGroup}>
            <View style={styles.fieldHeaderRow}>
              <Text style={styles.fieldLabel}>
                Issue Category <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              {analysisResult && (
                <Text style={styles.editableHint}>User editable</Text>
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
            <Text style={styles.fieldLabel}>Photo Attachment</Text>
            <Text style={styles.fieldHint}>
              Attach a photo from your gallery to help municipal teams identify the issue.
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
                    onPress={pickImage}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.changePhotoText}>Change Photo</Text>
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
              <TouchableOpacity
                style={styles.photoUploadArea}
                activeOpacity={0.75}
                onPress={pickImage}
              >
                <View style={styles.photoUploadIconContainer}>
                  <Text style={styles.photoUploadIcon}>🖼️</Text>
                </View>
                <Text style={styles.photoUploadTitle}>Select from Gallery</Text>
                <Text style={styles.photoUploadSubtitle}>
                  Supports JPG, PNG photos
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 3. Issue Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>
              Issue Title <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            <TextInput
              style={[styles.textInput, errors.title ? styles.inputErrorBorder : null]}
              placeholder="e.g. Deep pothole causing tire damage"
              placeholderTextColor="#94A3B8"
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
              placeholder="Provide details such as severity, safety hazards, or landmark references..."
              placeholderTextColor="#94A3B8"
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

          {/* 5. Location Manual Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>
              Location <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            <TextInput
              style={[styles.textInput, errors.location ? styles.inputErrorBorder : null]}
              placeholder="e.g. Near Market Street corner, opposite bakery"
              placeholderTextColor="#94A3B8"
              value={location}
              onChangeText={(text) => {
                setLocation(text);
                if (errors.location) setErrors((prev) => ({ ...prev, location: undefined }));
              }}
            />
            {errors.location ? (
              <Text style={styles.errorCaptionText}>⚠️ {errors.location}</Text>
            ) : (
              <Text style={styles.fieldHint}>
                Enter the street, landmark, or intersection manually.
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
                <View>
                  <Text style={styles.aiSectionTitle}>AI-Assisted Issue Analysis</Text>
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
                <ActivityIndicator size="small" color="#0D9488" />
                <Text style={styles.aiLoadingText}>
                  Analyzing civic issue details with simulated Gemma 4 analyzer...
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
                  {analysisResult ? 'Re-analyze with AI' : 'Analyze with AI'}
                </Text>
              </TouchableOpacity>
            )}

            {/* AI Analysis Result Display */}
            {analysisResult && !isAnalyzing && (
              <View style={styles.aiResultCard}>
                <View style={styles.aiDisclaimerBadge}>
                  <Text style={styles.aiDisclaimerBadgeText}>
                    AI ADVISORY SUGGESTION • NON-BINDING
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
                        <Text style={styles.categoryAppliedText}>Applied above</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.applyCategoryBtn}
                        onPress={() => setCategory(analysisResult.suggestedCategory)}
                      >
                        <Text style={styles.applyCategoryBtnText}>Apply to form</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Concise Summary */}
                <View style={styles.aiResultFieldGroup}>
                  <Text style={styles.aiResultFieldLabel}>CONCISE SUMMARY</Text>
                  <Text style={styles.aiSummaryContent}>{analysisResult.summary}</Text>
                </View>

                {/* Priority Explanation */}
                <View style={styles.aiResultFieldGroup}>
                  <Text style={styles.aiResultFieldLabel}>PRIORITY EXPLANATION</Text>
                  <Text style={styles.aiExplanationContent}>
                    {analysisResult.priorityExplanation}
                  </Text>
                </View>

                {/* Recommended Next Action */}
                <View style={styles.aiResultFieldGroup}>
                  <Text style={styles.aiResultFieldLabel}>RECOMMENDED NEXT ACTION</Text>
                  <Text style={styles.aiActionContent}>
                    👉 {analysisResult.recommendedNextAction}
                  </Text>
                </View>

                {/* Clear mock service disclaimer */}
                <View style={styles.aiProviderDisclaimer}>
                  <Text style={styles.aiProviderDisclaimerText}>
                    ⚡ Provider: {analysisResult.modelIdentifier}. All results are simulated
                    recommendations and do not represent official municipal decisions. You can
                    modify category, title, or details freely above before submitting.
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
                  <Text style={styles.submitButtonText}>Submit Report</Text>
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
            colors={['#0D9488']}
            tintColor="#0D9488"
          />
        }
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              <View style={styles.brandLogo}>
                <Text style={styles.brandLogoIcon}>🔍</Text>
              </View>
              <Text style={styles.headerTitle}>CivicLens AI</Text>
            </View>
            <View style={styles.locationContainer}>
              <Text style={styles.locationPinIcon}>📍</Text>
              <Text style={styles.locationSubtitle}>Your community</Text>
            </View>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Community Notifications"
            activeOpacity={0.7}
            style={styles.notificationButton}
            onPress={() => fetchReports(true)}
          >
            <Text style={styles.bellIcon}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Backend Unreachable / Error Banner (Requirement 8) */}
        {backendError && (
          <View style={styles.backendErrorBanner}>
            <View style={styles.backendErrorHeader}>
              <Text style={styles.backendErrorIcon}>⚠️</Text>
              <Text style={styles.backendErrorTitle}>Backend Connection Notice</Text>
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
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Civic Action Platform</Text>
          </View>
          <Text style={styles.heroTitle}>Let's make our streets better.</Text>
          <Text style={styles.heroSubtitle}>
            Spot an issue in your neighborhood? Snap a photo and let AI coordinate
            with municipal teams.
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
          <Text style={styles.sectionTitle}>Community Impact</Text>
          <Text style={styles.sectionBadge}>
            {reports.length} Total Reports
          </Text>
        </View>
        <View style={styles.impactContainer}>
          <View style={styles.impactCard}>
            <Text style={styles.impactNumber}>{reports.length}</Text>
            <Text style={styles.impactLabel}>Issues Reported</Text>
            <View style={[styles.impactIndicator, { backgroundColor: '#0EA5E9' }]} />
          </View>
          <View style={styles.impactCard}>
            <Text style={styles.impactNumber}>{resolvedCount}</Text>
            <Text style={styles.impactLabel}>Resolved</Text>
            <View style={[styles.impactIndicator, { backgroundColor: '#10B981' }]} />
          </View>
          <View style={styles.impactCard}>
            <Text style={styles.impactNumber}>{reportedCount + underReviewCount}</Text>
            <Text style={styles.impactLabel}>Active</Text>
            <View style={[styles.impactIndicator, { backgroundColor: '#F59E0B' }]} />
          </View>
        </View>

        {/* Nearby Issues Section */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Nearby Issues</Text>
            <Text style={styles.sectionCaption}>Live reports from CivicLens FastAPI backend</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => fetchReports(true)}
          >
            <Text style={styles.seeAllText}>Refresh ↻</Text>
          </TouchableOpacity>
        </View>

        {/* Loading State */}
        {isLoadingReports && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#0D9488" />
            <Text style={styles.loadingText}>Fetching community reports...</Text>
          </View>
        )}

        {/* Empty State */}
        {!isLoadingReports && reports.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🌱</Text>
            <Text style={styles.emptyTitle}>No Civic Reports Found</Text>
            <Text style={styles.emptySubtitle}>
              Be the first citizen to report an issue in your neighborhood.
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
        <View style={styles.reportsList}>
          {reports.map((report) => (
            <TouchableOpacity
              key={report.id}
              style={styles.reportCard}
              activeOpacity={0.85}
              onPress={() => handleOpenReportDetails(report.id)}
            >
              <View style={styles.reportCardHeader}>
                <View style={styles.iconAndTitle}>
                  <View style={styles.categoryIconBox}>
                    <Text style={styles.categoryIcon}>{report.categoryIcon}</Text>
                  </View>
                  <View style={styles.reportTitleArea}>
                    <View style={styles.titleRow}>
                      <Text style={styles.reportRefTag}>{report.referenceNo}</Text>
                      <Text style={styles.reportCategory}>{report.category}</Text>
                    </View>
                    <Text style={styles.reportTitle}>{report.title}</Text>
                  </View>
                </View>
                {renderStatusBadge(report.status)}
              </View>

              <Text style={styles.reportDescriptionPreview} numberOfLines={2}>
                {report.description}
              </Text>

              {/* Show AI suggested priority chip on card if available */}
              {report.suggestedPriority && (
                <View style={styles.cardAiAnalysisRow}>
                  <Text style={styles.cardAiAnalysisTag}>
                    ⚡ Priority: {report.suggestedPriority}
                  </Text>
                </View>
              )}

              {report.imageUri && (
                <View style={styles.reportCardImageWrapper}>
                  <Image
                    source={{ uri: report.imageUri }}
                    style={styles.reportCardImage}
                    resizeMode="cover"
                  />
                </View>
              )}

              <View style={styles.cardDivider} />

              <View style={styles.reportCardFooter}>
                <View style={styles.footerLocationRow}>
                  <Text style={styles.footerPinIcon}>📍</Text>
                  <Text style={styles.footerLocationText}>{report.location}</Text>
                </View>
                <View style={styles.verifiedTag}>
                  <Text style={styles.verifiedText}>{report.createdAt}</Text>
                </View>
              </View>

              <View style={styles.cardTapPrompt}>
                <Text style={styles.cardTapPromptText}>Tap to view details & status actions →</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Notice / Transparency Disclaimer */}
        <View style={styles.transparencyCard}>
          <Text style={styles.transparencyTitle}>💡 Backend & AI Integration</Text>
          <Text style={styles.transparencyText}>
            Reports synchronize directly with the FastAPI backend service. AI urgency suggestions
            are currently evaluated via the client simulation layer and will link to Gemma inference in future milestones.
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderPlaceholderScreen = (
    title: string,
    subtitle: string,
    icon: string
  ) => (
    <View style={styles.placeholderContainer}>
      <View style={styles.placeholderIconContainer}>
        <Text style={styles.placeholderIcon}>{icon}</Text>
      </View>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
      <TouchableOpacity
        style={styles.placeholderButton}
        activeOpacity={0.8}
        onPress={() => {
          setIsReportingFlow(false);
          setActiveTab('home');
        }}
      >
        <Text style={styles.placeholderButtonText}>Return to Home</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* Main Content Area */}
        <View style={styles.mainContent}>
          {isReportingFlow ? (
            renderReportScreen()
          ) : activeTab === 'home' ? (
            renderHomeScreen()
          ) : activeTab === 'explore' ? (
            renderPlaceholderScreen(
              'Explore Community Map',
              'Interactive map view displaying geo-fenced community reports and verified municipal roadwork.',
              '🗺️'
            )
          ) : (
            renderPlaceholderScreen(
              'My Reports',
              'Track history, progress stages, and municipal responses for all your submitted civic reports.',
              '📋'
            )
          )}
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
              🏛️
            </Text>
            <Text
              style={[
                styles.navLabel,
                activeTab === 'home' && !isReportingFlow && styles.navLabelActive,
              ]}
            >
              Home
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
              🧭
            </Text>
            <Text
              style={[
                styles.navLabel,
                activeTab === 'explore' && !isReportingFlow && styles.navLabelActive,
              ]}
            >
              Explore
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
              My Reports
            </Text>
            {activeTab === 'reports' && !isReportingFlow && (
              <View style={styles.activeTabIndicator} />
            )}
          </TouchableOpacity>
        </View>

        {/* Report Details & Status Management Modal (Requirements 6 & 7) */}
        <Modal
          visible={Boolean(selectedReportId)}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedReportId(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
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
                  <ActivityIndicator size="small" color="#0D9488" />
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

                  {/* Category & Location */}
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
                      <Text style={styles.modalAiTitle}>✨ AI ADVISORY SUMMARY</Text>
                      <Text style={styles.modalAiSummary}>{detailedReport.aiAnalysis.summary}</Text>
                      <Text style={styles.modalAiAction}>
                        👉 {detailedReport.aiAnalysis.recommendedNextAction}
                      </Text>
                    </View>
                  )}

                  {/* Status Update Control (Requirement 7 - Connected to PATCH /api/reports/{id}/status) */}
                  <View style={styles.statusUpdateContainer}>
                    <Text style={styles.statusUpdateHeader}>UPDATE REPORT STATUS</Text>
                    <Text style={styles.statusUpdateSub}>
                      Update the workflow stage on the live backend:
                    </Text>

                    <View style={styles.statusButtonRow}>
                      {(['Reported', 'Under Review', 'Resolved'] as ReportStatus[]).map((st) => {
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
                    {isUpdatingStatus && (
                      <View style={styles.statusUpdatingRow}>
                        <ActivityIndicator size="small" color="#0D9488" />
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
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mainContent: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0D9488',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  brandLogoIcon: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  locationPinIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  locationSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0D9488',
  },
  notificationButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  bellIcon: {
    fontSize: 18,
  },
  notificationDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },

  /* Hero Card */
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 22,
    marginBottom: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(13, 148, 136, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.4)',
  },
  heroBadgeText: {
    color: '#2DD4BF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 30,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryActionButton: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  cameraIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
    fontWeight: '700',
  },

  /* Section Headers */
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionCaption: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0D9488',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0D9488',
  },

  /* Impact Summary */
  impactContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 10,
  },
  impactCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  impactNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  impactLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  impactIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },

  /* Reports List */
  reportsList: {
    gap: 12,
    marginBottom: 20,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
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
    marginRight: 8,
  },
  categoryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
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
    marginBottom: 2,
    gap: 6,
  },
  reportRefTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0D9488',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  reportCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },
  reportDescriptionPreview: {
    fontSize: 13,
    color: '#475569',
    marginTop: 8,
    lineHeight: 18,
  },
  cardAiAnalysisRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  cardAiAnalysisTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  reportCardImageWrapper: {
    marginTop: 10,
    borderRadius: 10,
    overflow: 'hidden',
    height: 140,
    backgroundColor: '#E2E8F0',
  },
  reportCardImage: {
    width: '100%',
    height: '100%',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
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
    color: '#475569',
    fontWeight: '500',
  },
  verifiedTag: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },

  /* Transparency Card */
  transparencyCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  transparencyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
    marginBottom: 4,
  },
  transparencyText: {
    fontSize: 12,
    color: '#115E59',
    lineHeight: 18,
  },

  /* Form Screen Styles */
  formScrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
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
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButtonIcon: {
    fontSize: 20,
    color: '#0D9488',
    fontWeight: '700',
    marginRight: 4,
    lineHeight: 20,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D9488',
  },
  prototypeHeaderBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  prototypeBadgeText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  formHeaderSection: {
    marginBottom: 12,
  },
  formScreenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  formScreenSubtitle: {
    fontSize: 15,
    color: '#64748B',
  },
  prototypeDisclaimerPill: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  disclaimerPillText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '600',
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
    color: '#1E293B',
    marginBottom: 6,
  },
  editableHint: {
    fontSize: 11,
    color: '#0D9488',
    fontWeight: '700',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  requiredAsterisk: {
    color: '#EF4444',
  },
  fieldHint: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  textAreaInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    minHeight: 100,
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipSelected: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  categoryChipIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  categoryChipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  categoryChipLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Photo Attachment */
  photoUploadArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoUploadIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  photoUploadIcon: {
    fontSize: 24,
  },
  photoUploadTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0D9488',
    marginBottom: 2,
  },
  photoUploadSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  photoAttachedBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
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
    color: '#0D9488',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#CCFBF1',
    marginBottom: 22,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F0FDFA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  aiIconSparkle: {
    fontSize: 18,
  },
  aiSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  aiSectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
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
    backgroundColor: '#F0FDFA',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99F6E4',
    gap: 10,
  },
  aiLoadingText: {
    flex: 1,
    fontSize: 13,
    color: '#0F766E',
    fontWeight: '600',
  },
  analyzeButton: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0D9488',
    gap: 8,
  },
  analyzeButtonIcon: {
    fontSize: 16,
  },
  analyzeButtonText: {
    color: '#0D9488',
    fontSize: 14,
    fontWeight: '800',
  },

  /* AI Result Card */
  aiResultCard: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  aiTimeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  aiResultFieldGroup: {
    marginBottom: 10,
  },
  aiResultFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
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
    color: '#0F172A',
  },
  categoryAppliedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryAppliedText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '700',
  },
  applyCategoryBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  applyCategoryBtnText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  aiSummaryContent: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 18,
    fontWeight: '500',
  },
  aiExplanationContent: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  aiActionContent: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '700',
    lineHeight: 18,
  },
  aiProviderDisclaimer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  aiProviderDisclaimerText: {
    fontSize: 10,
    color: '#94A3B8',
    lineHeight: 14,
    fontStyle: 'italic',
  },

  /* Form Actions */
  formActionArea: {
    marginTop: 10,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  cancelLinkText: {
    color: '#64748B',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
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
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  referenceBadgeContainer: {
    backgroundColor: '#F0FDFA',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    alignItems: 'center',
    marginBottom: 18,
    width: '100%',
  },
  referenceLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  referenceCode: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0D9488',
    letterSpacing: 1.5,
  },
  summaryBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryKey: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryAiSection: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  summaryAiHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0D9488',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  summaryAiNote: {
    fontSize: 11,
    color: '#0F766E',
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
  prototypeNotice: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 20,
    width: '100%',
  },
  prototypeNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    marginBottom: 2,
  },
  prototypeNoticeText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  successButtonActions: {
    width: '100%',
    gap: 10,
  },
  secondaryOutlineButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0D9488',
    alignItems: 'center',
  },
  secondaryOutlineButtonText: {
    color: '#0D9488',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Placeholder Screens */
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#F8FAFC',
  },
  placeholderIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  placeholderIcon: {
    fontSize: 36,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
  },
  placeholderSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 26,
  },
  placeholderButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#0D9488',
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
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 10,
    paddingBottom: 16,
    justifyContent: 'space-around',
    shadowColor: '#0F172A',
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
    opacity: 0.5,
  },
  navIconActive: {
    opacity: 1,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  navLabelActive: {
    color: '#0D9488',
    fontWeight: '800',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: -6,
    width: 20,
    height: 3,
    backgroundColor: '#0D9488',
    borderRadius: 2,
  },

  /* Backend Error & Status Banners */
  backendErrorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 14,
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

  /* Loading & Empty States */
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#0D9488',
    fontWeight: '600',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyActionButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Card tap hint */
  cardTapPrompt: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    alignItems: 'flex-end',
  },
  cardTapPromptText: {
    fontSize: 11,
    color: '#0D9488',
    fontWeight: '600',
  },

  /* Submit button disabled state */
  submitButtonDisabled: {
    opacity: 0.7,
  },

  /* Report Details Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitleGroup: {
    flex: 1,
    marginRight: 12,
  },
  modalHeaderBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D9488',
    marginBottom: 2,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  modalScrollArea: {
    maxHeight: 460,
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
    color: '#0D9488',
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
    borderBottomColor: '#F1F5F9',
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  modalDetailGroup: {
    marginBottom: 14,
  },
  modalDetailKey: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modalDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalDescriptionText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  modalAttachedImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    marginTop: 6,
  },
  modalAiSection: {
    backgroundColor: '#F0FDFA',
    borderColor: '#CCFBF1',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
  },
  modalAiTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  modalAiSummary: {
    fontSize: 12,
    color: '#134E4A',
    lineHeight: 18,
    marginBottom: 4,
  },
  modalAiAction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0D9488',
  },
  statusUpdateContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusUpdateHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  statusUpdateSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  statusButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusOptionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  statusOptionButtonActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
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
    color: '#0D9488',
    fontWeight: '600',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalClosePrimaryBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalClosePrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
