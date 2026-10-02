export interface ManualConfig {
  appName: string;
  repoUrl: string;
  deploymentUrl: string;
  description: string;
  authorName: string;
  contactEmail: string;
  license: string;
  requirements: string[];
  installationSteps: InstallationStep[];
  featuresList: FeatureStep[];
  flameshotTips: FlameshotTip[];
}

export interface InstallationStep {
  id: string;
  title: string;
  command: string;
  explanation: string;
}

export interface FeatureStep {
  id: string;
  title: string;
  description: string;
  iconName: string; // lucide icon identifier
  stepsDetail: string[];
  imagePlaceholderId: string; // id for corresponding screenshot template
}

export interface FlameshotTip {
  key: string;
  tool: string;
  description: string;
  colorHex: string;
}

export interface SelectedAnuran {
  nameCommon: string;
  nameScientific: string;
  family: string;
  confidence: number;
  habitat: string;
  description: string;
  image: string;
  soundDescription: string;
}
