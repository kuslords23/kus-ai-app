export interface ArtifactCapture {
  id: string;
  createdAt: Date;
  sourceUrl: string;
  type: "generated_app" | "code_snippet" | "refactor" | "analysis";
  name: string;
  description: string;
  filePaths: string[];
  files: Array<{ path: string; content: string; language: string }>;
  techStack: string[];
  tags: string[];
}

export class ArtifactSyncPipeline {
  private records: ArtifactCapture[] = [];

  async captureAndPublish(artifact: ArtifactCapture): Promise<boolean> {
    this.records.push(artifact);
    return true;
  }

  getHistory() {
    return [...this.records];
  }
}

export const artifactSyncPipeline = new ArtifactSyncPipeline();