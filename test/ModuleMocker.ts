import { mock } from 'bun:test';

export type MockResult = {
  clear: () => void;
};

/**
 * Due to an issue with Bun (https://github.com/oven-sh/bun/issues/7823), we need to manually restore mocked modules
 * after we're done. We do this by setting the mocked value to the original module.
 *
 * When setting up a test that will mock a module, the block should add this:
 * const moduleMocker = new ModuleMocker()
 *
 * afterEach(() => {
 *   moduleMocker.clear()
 * })
 *
 * When a test mocks a module, it should do it this way:
 *
 * await moduleMocker.mock('@/services/token.ts', () => ({
 *   getBucketToken: mock(() => {
 *     throw new Error('Unexpected error')
 *   })
 * }))
 *
 */

export class ModuleMocker {
  private mocks: MockResult[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async mock(modulePath: string, renderMocks: () => Record<string, any>): Promise<void> {
    const original = {
      ...(await import(modulePath)),
    };
    const mocks = renderMocks();
    const result = {
      ...original,
      ...mocks,
    };
    mock.module(modulePath, () => result);

    this.mocks.push({
      clear: () => {
        mock.module(modulePath, () => original);
      },
    });
  }

  clear(): void {
    this.mocks.forEach((mockResult) => mockResult.clear());
    this.mocks = [];
  }
}
