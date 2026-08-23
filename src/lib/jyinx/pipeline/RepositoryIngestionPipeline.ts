import { autoPackagingEngine, type PackageInput } from "./AutoPackagingEngine";
import { artifactSyncPipeline, type ArtifactCapture } from "./ArtifactSyncPipeline";

export interface IngestionRequest {
  repoUrl: string;
  name?: string;
  tags?: string[];
  requestedBy?: string;
}

export interface IngestionResult {
  success: boolean;
  repoUrl: string;
  name: string;
  fileCount: number;
  techStack: string[];
  listingId?: string;
  error?: string;
  durationMs: number;
}

export class RepositoryIngestionPipeline {
  private inProgress = new Set<string>();
  private ingestedRepos: Array<{ repoUrl: string; name: string; ingestedAt: Date; listingId?: string }> = [];

  async ingest(request: IngestionRequest): Promise<IngestionResult> {
    const startTime = Date.now();
    const { repoUrl, tags, requestedBy } = request;
    const name = request.name ?? repoUrl.split("/").pop()?.replace(/\.git$/, "") ?? "unknown";

    if (this.inProgress.has(repoUrl)) {
      return { success: false, repoUrl, name, fileCount: 0, techStack: [], error: "Already in progress", durationMs: Date.now() - startTime };
    }
    this.inProgress.add(repoUrl);

    try {
      // Validate + fetch via API
      const response = await fetch("/api/github/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      if (!response.ok) {
        return { success: false, repoUrl, name, fileCount: 0, techStack: [], error: "Clone failed", durationMs: Date.now() - startTime };
      }
      const data = (await response.json()) as any;
      const fileCount = data.files?.length ?? 0;
      const techStack = data.techStack ?? [];

      // Auto-package
      const pkgInput: PackageInput = {
        name,
        description: data.description ?? "Auto-ingested from " + repoUrl,
        readme: data.readme,
        sourceUrl: repoUrl,
        techStack,
        fileCount,
        files: (data.files ?? []).map((f: any) => ({ path: f.path, language: f.language, size: f.size })),
        creatorId: requestedBy ?? "system",
        customTags: tags,
      };
      const pkgResult = await autoPackagingEngine.package(pkgInput);

      // Sync as artifact
      const artifact: ArtifactCapture = {
        id: "ingest_" + Date.now().toString(36),
        createdAt: new Date(),
        sourceUrl: repoUrl,
        type: "generated_app",
        name,
        description: pkgInput.description,
        filePaths: (data.files ?? []).map((f: any) => f.path),
        files: (data.files ?? []).filter((f: any) => f.content).map((f: any) => ({ path: f.path, content: f.content, language: f.language })),
        techStack,
        tags: [...(tags ?? []), ...techStack],
      };
      await artifactSyncPipeline.captureAndPublish(artifact);

      this.ingestedRepos.push({ repoUrl, name, ingestedAt: new Date(), listingId: pkgResult.listingId });

      return {
        success: true,
        repoUrl,
        name,
        fileCount,
        techStack,
        listingId: pkgResult.listingId,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      return { success: false, repoUrl, name, fileCount: 0, techStack: [], error: String(err), durationMs: Date.now() - startTime };
    } finally {
      this.inProgress.delete(repoUrl);
    }
  }

  getIngestedRepos(): Array<{ repoUrl: string; name: string; ingestedAt: Date; listingId?: string }> {
    return [...this.ingestedRepos];
  }
}

export const repositoryIngestionPipeline = new RepositoryIngestionPipeline();