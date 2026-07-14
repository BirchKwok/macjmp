add_subdirectory(osx)

add_subdirectory(dummy)

find_all_sources(. SRC)
add_sources(${SRC})
