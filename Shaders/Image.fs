uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform float iTime;
uniform vec4 iMouse;
uniform vec2 iResolution;
out vec4 C;
#define MAX_STEPS 100
#define MAX_DIST 100.
#define SURF_DIST .01


void main()
{
    vec2 p = (gl_FragCoord.xy-0.5*iResolution)/iResolution.y;


    vec3 col = mix(vec3 (.01,0.1,0.1),vec3(0.8,0.8,1.0),-p.y);
    vec2 m = iMouse.z*(iMouse.xy/iResolution.xy);
    vec3 ro = vec3(0.0,2.0,-3.0);
    ro.yz *= Rot(-m.y+.4);
    ro.xz *= Rot(iTime*.2-m.x*6.2831);
    vec3 rd = normalize(vec3(p.x-0.1,p.y-0.2,1.0));
    float d=RayMarching(ro,rd);
    vec3 po =ro+d*rd;
    vec3 K_a = vec3(0.2, 0.2, 0.2);
        vec3 K_d = vec3(0.7, 0.2, 0.2);
        vec3 K_s = vec3(1.0, 1.0, 1.0);
        float shininess = 10.0;
        col = phongIllumination(K_a, K_d, K_s, shininess, po, ro);
    col = pow(col, vec3(.4545)); // gamma correction
    C = vec4( col, 1.0 );
}

