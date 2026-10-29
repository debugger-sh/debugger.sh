#include "SimpleTest.h"
#include "SimpleTest_config.h"
#include <cstdio>

#if DEBUGGER_HAS_USER_MAIN
int original_main(int argc, char** argv);
#endif

int main(int argc, char** argv) {
#if DEBUGGER_HAS_USER_MAIN
    original_main(argc, argv);
    std::fflush(stdout);
#endif
    return simpletest::run(SIMPLETEST_NONCE, SIMPLETEST_SELECTION, SIMPLETEST_ALL);
}
