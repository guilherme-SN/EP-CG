cmake_minimum_required(VERSION 3.16)

set (CMAKE_CXX_STANDARD 17)

project(RayMarching)
if(Boost_FOUND)
include_directories(${Boost_INCLUDE_DIRS}) 
endif()
include_directories( ${PROJECT_SOURCE_DIR}/includes )
add_executable(RayMarching stb_image/stb_image.cpp Shader.h glad.c RayMarching.cpp)

target_link_libraries(RayMarching GL dl glfw)

# Adiciona um alvo personalizado para rodar o programa após compilar
add_custom_target(
    run_program ALL
    DEPENDS RayMarching # Substitua "Introduction" pelo nome do seu executável
    COMMAND ./RayMarching
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)
