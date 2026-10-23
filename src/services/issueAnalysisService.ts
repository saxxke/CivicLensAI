export type IssueCategory =
  | 'Road Damage'
  | 'Garbage'
  | 'Broken Streetlight'
  | 'Waterlogging'
  | 'Water Supply'
  | 'Other';

export type SuggestedPriority = 'Low' | 'Medium' | 'High';

export interface AnalysisRequest {
  title?: string;
  description: string;
  selectedCategory?: IssueCategory;
  location?: string;
  hasPhoto?: boolean;
}

export interface IssueAnalysisResult {
  isMock: boolean;
  modelIdentifier: string;
  suggestedCategory: IssueCategory;
  summary: string;
  suggestedPriority: SuggestedPriority;
  priorityExplanation: string;
  recommendedNextAction: string;
  analyzedAt: string;
}

export interface IIssueAnalysisService {
  analyzeIssue(request: AnalysisRequest): Promise<IssueAnalysisResult>;
}

/**
 * MockIssueAnalysisService simulates the issue analysis response
 * for prototype testing without requiring an API key in the mobile client.
 *
 * NOTE: This is a clearly labeled client-side simulation.
 * It is structured to be swapped with a real Gemma 4 / cloud backend endpoint.
 */
export class MockIssueAnalysisService implements IIssueAnalysisService {
  async analyzeIssue(request: AnalysisRequest): Promise<IssueAnalysisResult> {
    // Simulate real backend inference network delay
    await new Promise((resolve) => setTimeout(resolve, 1400));

    const text = `${request.title || ''} ${request.description}`.toLowerCase();

    // Determine category heuristic simulation
    let category: IssueCategory = request.selectedCategory || 'Other';
    if (text.includes('pothole') || text.includes('road') || text.includes('crack') || text.includes('asphalt') || text.includes('crater')) {
      category = 'Road Damage';
    } else if (text.includes('garbage') || text.includes('waste') || text.includes('trash') || text.includes('dump') || text.includes('bin')) {
      category = 'Garbage';
    } else if (text.includes('light') || text.includes('lamp') || text.includes('dark') || text.includes('pole')) {
      category = 'Broken Streetlight';
    } else if (text.includes('waterlog') || text.includes('flood') || text.includes('drain') || text.includes('puddle') || text.includes('sewage overflow')) {
      category = 'Waterlogging';
    } else if (text.includes('leak') || text.includes('pipe') || text.includes('water supply') || text.includes('tap') || text.includes('drinking water')) {
      category = 'WaterSupply' as unknown as IssueCategory === ('WaterSupply' as any) ? 'Water Supply' : 'Water Supply';
    }

    // Determine suggested priority heuristic simulation
    let priority: SuggestedPriority = 'Medium';
    let explanation =
      'Routine municipal maintenance item that impacts standard community mobility and neighborhood aesthetics.';

    const highTriggers = [
      'danger',
      'accident',
      'hazard',
      'electrocution',
      'spark',
      'deep',
      'block',
      'flooding',
      'severe',
      'injury',
      'traffic jammed',
      'urgent',
      'burst',
    ];

    const lowTriggers = [
      'minor',
      'small',
      'cosmetic',
      'clean up later',
      'faint',
      'slight',
    ];

    if (highTriggers.some((trigger) => text.includes(trigger))) {
      priority = 'High';
      explanation =
        'Identified potential safety hazards, traffic impediments, or rapid deterioration risks requiring timely municipal dispatch.';
    } else if (lowTriggers.some((trigger) => text.includes(trigger))) {
      priority = 'Low';
      explanation =
        'Non-urgent civic issue with low safety impact suitable for scheduled routine maintenance rounds.';
    } else {
      if (category === 'Road Damage' || category === 'Waterlogging') {
        priority = 'Medium';
        explanation =
          'Potential to cause vehicle strain or localized pedestrian inconvenience if unaddressed across days.';
      }
    }

    // Generate summary
    const cleanDesc = request.description.trim();
    const shortDesc = cleanDesc.length > 70 ? `${cleanDesc.substring(0, 68)}...` : cleanDesc;
    const summary = `${category} issue: "${shortDesc}" in ${request.location?.trim() || 'community zone'}.`;

    // Next action recommendation
    let nextAction = 'Submit for community review and dispatch to the designated municipal department.';
    if (priority === 'High') {
      nextAction = 'Flag for expedited inspection by the local ward engineer and notify nearby commuters.';
    } else if (category === 'Garbage') {
      nextAction = 'Route to sanitation division for nearest waste collection truck route optimization.';
    } else if (category === 'Broken Streetlight') {
      nextAction = 'Schedule electrical maintenance crew for streetlight component check.';
    }

    return {
      isMock: true,
      modelIdentifier: 'Gemma 4 Mock Analyzer (Client-side simulation)',
      suggestedCategory: category,
      summary,
      suggestedPriority: priority,
      priorityExplanation: explanation,
      recommendedNextAction: nextAction,
      analyzedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }
}

// Export default singleton instance
export const issueAnalysisService: IIssueAnalysisService = new MockIssueAnalysisService();
