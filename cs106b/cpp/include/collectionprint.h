#pragma once
#include <iomanip>
#include <iterator>
#include <ostream>
#include <string>
#include <type_traits>

namespace cs106b_support {
template <typename T> void printValue(std::ostream& out, const T& value) { out << value; }
inline void printValue(std::ostream& out, const std::string& value) { out << std::quoted(value); }
inline void printValue(std::ostream& out, bool value) { out << (value ? "true" : "false"); }
template <typename Range> std::ostream& printRange(std::ostream& out, const Range& range) {
    out << '{';
    bool first = true;
    for (const auto& value : range) {
        if (!first) out << ", ";
        first = false;
        using Element = typename std::iterator_traits<decltype(range.begin())>::value_type;
        // std::vector<bool> may expose a const bit proxy instead of bool.
        if constexpr (std::is_same_v<Element, bool>) printValue(out, bool(value));
        else printValue(out, value);
    }
    return out << '}';
}
}
