out vec4 C;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform vec2 iResolution;
uniform vec4 iMouse;
uniform float iTime;
uniform int iFrame;


//Chimera's Breath
//by nimitz 2018 (twitter: @stormoid)

//see "Common" tab for fluid simulation code

float length2(vec2 p){return dot(p,p);}
mat2 mm2(in float a){float c = cos(a), s = sin(a);return mat2(c,s,-s,c);}

void main()
{

// Mouse = iMouse;
R = iResolution.xy;
time = iTime;
vec2 U = gl_FragCoord.xy;
vec2 uv = U/R;
    vec2 w = 1.0/R;

    vec4 lastMouse = texelFetch(iChannel0, ivec2(0,0), 0);
    vec4 data = solveFluid(iChannel0, uv, w, iTime, iMouse.xyz, lastMouse.xyz);

    if (iFrame < 50)
    {
        data = vec4(0.5,0,0,0);
    }

    if (U.y < 1.)
        data = iMouse;

    C = data;
}
