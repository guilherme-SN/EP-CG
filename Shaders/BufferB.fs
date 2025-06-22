

//uniform vec2 iResolution;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform vec2 iResolution;
uniform vec4 iMouse;
uniform float iTime;
uniform int iFrame;
out vec4 C;

const float radialBlurInstensity = 0.01;
const float speed = 3.0;
const float pi = 3.14159265359;
void main()
{

// Mouse = iMouse;
R = iResolution.xy;
time = iTime;
float s = sin(iTime*speed * pi / 16.0 - 1.0);
    vec2 radialBlurCenter = vec2((s * 0.5 + 0.5) * 0.5 + 0.25, abs(s)* 0.2 + 0.35);

        vec2 uv = gl_FragCoord.xy/iResolution.xy;
    vec2 uvCenter = uv - radialBlurCenter;
    float c = length(uv - radialBlurCenter);
    vec4 texBlurred = texture(iChannel0, uv);

    float itter = 0.0;

        for(float itter1 = 0.0; itter1 < 5.0; itter1++)
    {
        itter = itter1;
        texBlurred += texture(iChannel0, uvCenter * (1.0 - radialBlurInstensity *
        itter1 * c) + radialBlurCenter);
    }

    vec4 res = texBlurred / itter;

    vec4 prev = texture(iChannel1, uv);

    float motionBlur = mix(res.w, prev.w, 0.75);
    vec3 light = motionBlur * vec3(0.25, 0.5, 0.75);
        C = vec4(res.xyz + light*2.0, motionBlur);
}
