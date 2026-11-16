declare module 'gltf-validator' {
  export interface ValidationReport {
    issues: {
      numErrors: number;
      numWarnings: number;
      messages: { code: string; message: string; severity: number }[];
    };
    info: {
      animationCount: number;
      materialCount: number;
      drawCallCount: number;
      totalTriangleCount: number;
    };
  }
  export function validateBytes(
    data: Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<ValidationReport>;
}
