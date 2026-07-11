import os


# Test modules import the FastAPI application at collection time. Force every
# provider to its deterministic mode so a developer's local .env cannot make
# the suite call external services.
os.environ["INTENT_PROVIDER"] = "mock"
os.environ["CATALOG_PROVIDER"] = "openai"
os.environ["COMPARISON_PROVIDER"] = "mock"
os.environ["PAYMENTS_PROVIDER"] = "mock"
