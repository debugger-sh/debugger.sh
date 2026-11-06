#include "SimpleTest.h"
#include "SimpleTest_config.h"
#include <cstdio>

// Defined by the student (`#define main original_main`) or by a stub that
// prepare.ts injects when the student has no main.
int original_main();

int main() {
    original_main();
    std::fflush(stdout);
    return simpletest::run(SIMPLETEST_NONCE, SIMPLETEST_SELECTION, SIMPLETEST_ALL);
}
