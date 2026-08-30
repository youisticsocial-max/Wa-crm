-- ============================================================
-- 038_multi_provider_ai.sql — Multi-provider AI (Groq, OpenRouter, Gemini, Ollama, Custom)
--
-- Extends ai_configs table to support additional AI providers beyond
-- OpenAI and Anthropic, including free hosted providers (Groq, OpenRouter,
-- Gemini) and custom / self-hosted OpenAI-compatible endpoints (Ollama).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Update the CHECK constraint on ai_configs.provider
ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_provider_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'groq', 'openrouter', 'gemini', 'ollama', 'custom'));

-- 2. Add optional base_url column for custom or self-hosted endpoints
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS base_url text;
