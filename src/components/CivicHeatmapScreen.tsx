import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { IssueCategory, SuggestedPriority } from '../services/issueAnalysisService';
import { IssueReportItem, ReportStatus } from '../services/api';
import { THEME } from '../theme';

interface CivicHeatmapScreenProps {
  reports: IssueReportItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectReport: (reportId: string) => void;
  onStartReportFromMap: (lat: number, lng: number, addressHint?: string) => void;
}

const CATEGORY_FILTERS: { label: string; value: 'All' | IssueCategory; icon: string }[] = [
  { label: 'All Issues', value: 'All', icon: '🌐' },
  { label: 'Road Damage', value: 'Road Damage', icon: '🚧' },
  { label: 'Garbage', value: 'Garbage', icon: '🗑️' },
  { label: 'Streetlight', value: 'Broken Streetlight', icon: '💡' },
  { label: 'Waterlogging', value: 'Waterlogging', icon: '🌊' },
  { label: 'Water Supply', value: 'Water Supply', icon: '🚰' },
  { label: 'Other', value: 'Other', icon: '📌' },
];

type TimeFilter = '7d' | '30d' | 'all';

// Default Ward 14 Geographic Viewport (Downtown Municipal Zone)
const DEFAULT_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.2090,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

export const CivicHeatmapScreen: React.FC<CivicHeatmapScreenProps> = ({
  reports,
  isLoading,
  onRefresh,
  onSelectReport,
  onStartReportFromMap,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | IssueCategory>('All');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [activeReport, setActiveReport] = useState<IssueReportItem | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);

  // Parse and separate reports with verified coordinates from coordinate-less reports
  const { geoReports, missingCoordCount } = useMemo(() => {
    let missing = 0;
    const withGeo: IssueReportItem[] = [];

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    reports.forEach((r) => {
      // Time filtering check
      if (timeFilter !== 'all') {
        const limitDays = timeFilter === '7d' ? 7 : 30;
        // Check date if parsable, else keep
        const createdMs = Date.parse(r.createdAt);
        if (!isNaN(createdMs) && now - createdMs > limitDays * dayMs) {
          return;
        }
      }

      // Category filter check
      if (selectedCategory !== 'All' && r.category !== selectedCategory) {
        return;
      }

      // Coordinate presence validation: Strictly exclude fake or missing coordinates
      if (
        typeof r.latitude === 'number' &&
        !isNaN(r.latitude) &&
        typeof r.longitude === 'number' &&
        !isNaN(r.longitude) &&
        r.latitude !== 0 &&
        r.longitude !== 0
      ) {
        withGeo.push(r);
      } else {
        missing++;
      }
    });

    return { geoReports: withGeo, missingCoordCount: missing };
  }, [reports, selectedCategory, timeFilter]);

  // Marker pin color depending on priority / status
  const getMarkerPinColor = (report: IssueReportItem) => {
    if (report.status === 'Resolved') return '#10B981'; // Green
    if (report.suggestedPriority === 'High') return '#EF4444'; // Red alert
    if (report.suggestedPriority === 'Medium') return '#F59E0B'; // Amber
    return '#0D9488'; // Teal
  };

  return (
    <View style={styles.container}>
      {/* Top Floating Control Panel: Category & Time Filters */}
      <View style={styles.filterFloatingCard}>
        <View style={styles.filterCardHeader}>
          <View style={styles.filterTitleRow}>
            <View style={styles.livePulseDot} />
            <Text style={styles.filterTitle}>Civic Issue Heatmap</Text>
          </View>
          <View style={styles.timePillsRow}>
            {(['7d', '30d', 'all'] as TimeFilter[]).map((tf) => (
              <TouchableOpacity
                key={tf}
                style={[styles.timePill, timeFilter === tf && styles.timePillActive]}
                onPress={() => setTimeFilter(tf)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timePillText, timeFilter === tf && styles.timePillTextActive]}>
                  {tf === '7d' ? '7 Days' : tf === '30d' ? '30 Days' : 'All Time'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Category Horizontal Filter Carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORY_FILTERS.map((cat) => {
            const isSelected = selectedCategory === cat.value;
            return (
              <TouchableOpacity
                key={cat.label}
                style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                onPress={() => setSelectedCategory(cat.value)}
                activeOpacity={0.8}
              >
                <Text style={styles.categoryPillIcon}>{cat.icon}</Text>
                <Text
                  style={[
                    styles.categoryPillText,
                    isSelected && styles.categoryPillTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Map Viewport */}
      <MapView
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        region={mapRegion}
        onRegionChangeComplete={(r) => setMapRegion(r)}
        showsUserLocation
        showsMyLocationButton
        onPress={() => setActiveReport(null)}
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          onStartReportFromMap(latitude, longitude, `Map Pin (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
        }}
      >
        {geoReports.map((report) => (
          <Marker
            key={report.id}
            coordinate={{
              latitude: report.latitude as number,
              longitude: report.longitude as number,
            }}
            pinColor={getMarkerPinColor(report)}
            onPress={() => setActiveReport(report)}
          >
            <View style={[styles.customMarkerPin, { borderColor: getMarkerPinColor(report) }]}>
              <Text style={styles.customMarkerIcon}>{report.categoryIcon || '📌'}</Text>
            </View>
            <Callout tooltip onPress={() => onSelectReport(report.id)}>
              <View style={styles.calloutBox}>
                <Text style={styles.calloutTitle}>{report.title}</Text>
                <Text style={styles.calloutSub}>{report.category} • {report.status}</Text>
                <Text style={styles.calloutTapPrompt}>Tap to view details →</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Map Legend Overlay */}
      <View style={styles.legendContainer}>
        <Text style={styles.legendHeader}>SEVERITY HOTSPOTS</Text>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendLabel}>High Priority</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendLabel}>Medium</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendLabel}>Resolved</Text>
        </View>
      </View>

      {/* Long-Press Prompt Overlay */}
      <View style={styles.mapActionHelperBadge}>
        <Text style={styles.mapActionHelperText}>
          💡 Long press anywhere on the map to file a report at that spot
        </Text>
      </View>

      {/* Coordinate-less Reports Notice */}
      {missingCoordCount > 0 && (
        <View style={styles.missingCoordsBanner}>
          <Text style={styles.missingCoordsText}>
            ℹ️ {missingCoordCount} report(s) without GPS coordinates are omitted from map display.
          </Text>
        </View>
      )}

      {/* Report Quick Detail Bottom Card when a marker is tapped */}
      {activeReport && (
        <View style={styles.bottomSheetCard}>
          <View style={styles.bottomSheetHeader}>
            <View style={styles.bottomSheetBadgeRow}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>
                  {activeReport.categoryIcon} {activeReport.category}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  activeReport.status === 'Resolved'
                    ? styles.statusBadgeResolved
                    : activeReport.status === 'Under Review'
                    ? styles.statusBadgeReview
                    : styles.statusBadgeReported,
                ]}
              >
                <Text style={styles.statusBadgeText}>{activeReport.status}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setActiveReport(null)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.bottomSheetTitle} numberOfLines={2}>
            {activeReport.title}
          </Text>

          <View style={styles.bottomSheetMetaRow}>
            <Text style={styles.metaIcon}>📍</Text>
            <Text style={styles.metaLocation} numberOfLines={1}>
              {activeReport.location}
            </Text>
            <Text style={styles.metaTime}>• {activeReport.createdAt}</Text>
          </View>

          <View style={styles.bottomSheetActionsRow}>
            <TouchableOpacity
              style={styles.inspectReportBtn}
              onPress={() => onSelectReport(activeReport.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.inspectReportBtnText}>Inspect & Track Workflow →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.mapLoadingOverlay}>
          <ActivityIndicator size="small" color={THEME.colors.brandTeal} />
          <Text style={styles.mapLoadingText}>Updating live telemetry...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E2E8F0',
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },

  /* Floating Filter Card */
  filterFloatingCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 12 : 8,
    left: 12,
    right: 12,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  filterCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0D9488',
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    letterSpacing: -0.2,
  },
  timePillsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 2,
    gap: 2,
  },
  timePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timePillActive: {
    backgroundColor: THEME.colors.brandTeal,
  },
  timePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  timePillTextActive: {
    color: '#FFFFFF',
  },
  categoryScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  categoryPillActive: {
    backgroundColor: '#CCFBF1',
    borderColor: '#0D9488',
  },
  categoryPillIcon: {
    fontSize: 12,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  categoryPillTextActive: {
    color: '#0F766E',
    fontWeight: '800',
  },

  /* Custom Pin */
  customMarkerPin: {
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  customMarkerIcon: {
    fontSize: 16,
  },

  /* Callout */
  calloutBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    minWidth: 170,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    marginBottom: 2,
  },
  calloutSub: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 4,
  },
  calloutTapPrompt: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.brandTeal,
  },

  /* Map Legend */
  legendContainer: {
    position: 'absolute',
    bottom: 95,
    left: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  legendHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#334155',
  },

  /* Helper hint */
  mapActionHelperBadge: {
    position: 'absolute',
    top: 98,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  mapActionHelperText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },

  /* Missing coords banner */
  missingCoordsBanner: {
    position: 'absolute',
    top: 128,
    alignSelf: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  missingCoordsText: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '600',
  },

  /* Bottom Card */
  bottomSheetCard: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 6,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bottomSheetBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primaryNavy,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeReported: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeReview: {
    backgroundColor: '#E0E7FF',
  },
  statusBadgeResolved: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E293B',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
  },
  bottomSheetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.primaryNavy,
    lineHeight: 20,
    marginBottom: 6,
  },
  bottomSheetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  metaLocation: {
    fontSize: 12,
    color: '#64748B',
    maxWidth: '65%',
  },
  metaTime: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 4,
  },
  bottomSheetActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inspectReportBtn: {
    flex: 1,
    backgroundColor: THEME.colors.brandTeal,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  inspectReportBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  /* Loading Overlay */
  mapLoadingOverlay: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapLoadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.primaryNavy,
  },
});
