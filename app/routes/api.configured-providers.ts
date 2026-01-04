import type { LoaderFunction } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';

interface ConfiguredProvider {
  name: string;
  isConfigured: boolean;
  configMethod: 'environment' | 'none';
}

interface ConfiguredProvidersResponse {
  providers: ConfiguredProvider[];
}

/**
 * API endpoint that detects which providers are configured via environment variables
 * This helps auto-enable providers that have been set up by the user
 */
export const loader: LoaderFunction = async ({ context }) => {
  try {
    const llmManager = LLMManager.getInstance(context?.cloudflare?.env as any);
    const configuredProviders: ConfiguredProvider[] = [];

    // Get ALL providers from the LLM manager
    const allProviders = llmManager.getAllProviders();

    // Check each provider for environment configuration
    for (const providerInstance of allProviders) {
      const providerName = providerInstance.name;
      let isConfigured = false;
      let configMethod: 'environment' | 'none' = 'none';

      const config = providerInstance.config;

      // Check API key first (most providers use API keys)
      if (config.apiTokenKey) {
        const apiTokenEnvVar = config.apiTokenKey;
        const envApiToken =
          (context?.cloudflare?.env as Record<string, any>)?.[apiTokenEnvVar] ||
          process.env[apiTokenEnvVar] ||
          llmManager.env[apiTokenEnvVar];

        // Only consider configured if API key is set and not a placeholder
        const isValidApiToken =
          envApiToken &&
          typeof envApiToken === 'string' &&
          envApiToken.trim().length > 0 &&
          !envApiToken.includes('your_') && // Filter out placeholder values
          !envApiToken.includes('_here') &&
          envApiToken.length > 10; // API keys are typically longer than 10 chars

        if (isValidApiToken) {
          isConfigured = true;
          configMethod = 'environment';
        }
      }

      // Check base URL for local providers (Ollama, LMStudio, OpenAILike)
      if (config.baseUrlKey && !isConfigured) {
        const baseUrlEnvVar = config.baseUrlKey;
        const cloudflareEnv = (context?.cloudflare?.env as Record<string, any>)?.[baseUrlEnvVar];
        const processEnv = process.env[baseUrlEnvVar];
        const managerEnv = llmManager.env[baseUrlEnvVar];

        const envBaseUrl = cloudflareEnv || processEnv || managerEnv;

        /*
         * Only consider configured if environment variable is explicitly set
         * Don't count default config.baseUrl values or placeholder values
         */
        const isValidEnvValue =
          envBaseUrl &&
          typeof envBaseUrl === 'string' &&
          envBaseUrl.trim().length > 0 &&
          !envBaseUrl.includes('your_') && // Filter out placeholder values like "your_openai_like_base_url_here"
          !envBaseUrl.includes('_here') &&
          envBaseUrl.startsWith('http'); // Must be a valid URL

        if (isValidEnvValue) {
          isConfigured = true;
          configMethod = 'environment';
        }
      }

      configuredProviders.push({
        name: providerName,
        isConfigured,
        configMethod,
      });
    }

    return json<ConfiguredProvidersResponse>({
      providers: configuredProviders,
    });
  } catch (error) {
    console.error('Error detecting configured providers:', error);

    // Return empty array on error
    return json<ConfiguredProvidersResponse>({
      providers: [],
    });
  }
};
