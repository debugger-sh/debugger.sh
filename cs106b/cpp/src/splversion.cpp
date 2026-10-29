/*
 * File: splversion.cpp
 * --------------------
 * @author Julie Zelenski
 * Web port of the Stanford 2025.2 installed-resource lookup. The browser owns
 * this immutable directory; no Qt installation or host-user directory exists.
 */
#include "splversion.h"
#include "error.h"

std::string getLibraryInfoPanelMessage() {
    return "Stanford C++ Library version 2025.2 (WebIDE browser port)";
}
std::string getLibraryVersion() { return "2025.2"; }
std::string getLibraryPathForResource(const std::string& name) {
    if (name.empty() || name.find('/') != std::string::npos ||
        name.find('\\') != std::string::npos || name == "." || name == "..") {
        error("getLibraryPathForResource: expected a resource filename");
    }
#ifdef __wasi__
    return "/__cs106b/" + name;
#else
    return "third_party/stanfordcpplib/Library/resources/" + name;
#endif
}
