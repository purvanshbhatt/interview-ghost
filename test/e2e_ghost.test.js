/**
 * Ghost Master E2E Test Suite Aggregator
 * 
 * Executes all 4 E2E testing tiers covering all 18 features in PROJECT.md:
 * - Tier 1: Feature Coverage (>=5 tests per feature, >=90 tests)
 * - Tier 2: Boundary & Corner Cases (>=5 tests per feature, >=90 tests)
 * - Tier 3: Cross-Feature Combinations (pairwise interactions)
 * - Tier 4: Real-World Application Scenarios (end-to-end interview & extension flows)
 */

// Load Tier 1: Feature Coverage
require('./e2e/tier1_features.test.js');

// Load Tier 2: Boundary & Corner Cases
require('./e2e/tier2_boundaries.test.js');

// Load Tier 3: Cross-Feature Combinations
require('./e2e/tier3_combinations.test.js');

// Load Tier 4: Real-World Application Scenarios
require('./e2e/tier4_scenarios.test.js');
