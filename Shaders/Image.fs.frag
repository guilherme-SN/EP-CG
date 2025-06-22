uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform float iTime;
uniform vec4 iMouse;
uniform vec2 iResolution;
uniform int iFrame;
out vec4 C;

const float PI = 3.1459;

const int MAX_STEPS = 100;               // Número máximo de iterações do ray marching
const float MAX_DISTANCE = 80.0;           // Distância máxima que o raio pode percorrer
const float MIN_DISTANCE = 0.01;           // Distância mínima para considerar uma colisão
const float SPEED = 4.0;                   // Velocidade da "câmera" indo para frente

// Parâmetros do ciclo dia/noite
const float DAY_DURATION = 9.0;            // Duração de um ciclo completo dia+noite em segundos
const float DAY_NIGHT_RATIO = 0.5;         // Proporção do ciclo que é dia (0.0 a 1.0)

// Parâmetros das árvores
//const int NUM_TREES = 15;
const float TREE_SPACING = 15.0;
const float TREE_START_Z = 30.0;        // Default = 30.0
const float TREE_RISE_DISTANCE = 10.0;   // Default = 5.0

// --- PARÂMETROS DE DENSIDADE DAS ÁRVORES --- // NOVO
const int MIN_TREES = 5;                 // Número inicial de árvores a serem renderizadas.
const int MAX_TREES = 30;                // Número máximo de árvores quando a densidade for total.
const float DENSITY_START_TIME = 3.0;    // Em que segundo a densidade começa a aumentar.
const float DENSITY_DURATION = 30.0;     // Duração (em segundos) da transição de poucas para muitas árvores.

// Estrutura representando um objeto atingido pelo raio
struct Surface {
    float dist;    // Distância da interseção
    vec3 color;    // Cor do objeto
    float id;      // ID para diferenciar objetos
};

// SDF (Signed Distance Function) para uma esfera
float sdSphere(vec3 p, vec4 sphere) {
    return length(p - sphere.xyz) - sphere.w;
}

// SDF de um cubo centrado na origem com tamanho dado por "b"
float sdBox(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// SDF para um plano horizontal
float sdPlane(vec3 p) {
    return p.y + 1.5; // plano em y = -1.5
}

// SDF da estrada, representada como um retângulo achatado
float sdRoad(vec3 p) {
    vec2 size = vec2(1.5, 0.01); // largura e espessura da estrada
    vec2 d = abs(vec2(p.x, p.y + 1.5)) - size;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// SDF de um cilindro vertical (tronco da árvore)
float sdVerticalCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Função para gerar uma árvore do tipo 1 com tronco e copa (forma arredondada)
Surface simpleTree(vec3 p, vec3 treePos, float growthFactor) { // Adicionado growthFactor
    Surface s;
    s.dist = 1e6;
    s.id = -1.0;

    vec3 localP = (p - treePos); // Aplica escala

    // Ajustar altura e raio do tronco com base no growthFactor
    float trunkHeight = 1.5 * growthFactor;
    float trunkRadius = 0.08 * growthFactor;

    // Tronco da árvore (mais fino e alto)
    float dTrunk = sdVerticalCylinder(localP - vec3(0, 1.2 * growthFactor, 0), trunkHeight, trunkRadius);

    if (dTrunk < s.dist) {
        s.dist = dTrunk;
        s.color = vec3(0.35, 0.2, 0.1); // marrom mais escuro
        s.id = 4.0;
    }

    // Copa da árvore formada por esferas
    vec3 foliageCenters[4];
    foliageCenters[0] = vec3(0, 2.5, 0);
    foliageCenters[1] = vec3(0.5, 2.0, 0.3);
    foliageCenters[2] = vec3(-0.4, 2.1, -0.3);
    foliageCenters[3] = vec3(0.3, 1.8, -0.4);

    for (int i = 0; i < 4; i++) {
        vec3 foliageCenterAdjusted = foliageCenters[i];
        foliageCenterAdjusted.y *= growthFactor;

        float dLeaf = sdSphere(localP, vec4(foliageCenterAdjusted, 0.7 * growthFactor)); // Ajustado o raio
        if (dLeaf < s.dist) {
            s.dist = dLeaf;
            s.color = vec3(0.15, 0.5, 0.15); // verde mais escuro
            s.id = 5.0;
        }
    }

    return s;
}


// Função para calcular o estado dia/noite (0.0 = noite, 1.0 = dia completo)
float getDayNightCycle(float time) {
    float cyclePos = mod(time, DAY_DURATION) / DAY_DURATION;
    float dayAmount = smoothstep(0.0, 0.1, cyclePos) - 
                     smoothstep(DAY_NIGHT_RATIO, DAY_NIGHT_RATIO+0.1, cyclePos);
    return dayAmount;
}


// Função de mapeamento que calcula a menor distância de p para qualquer objeto
Surface map(vec3 p) {
    Surface s;
    s.dist = 1e6;
    s.id = -1.0;

    float d;
        
    // Cubo no centro, surgindo lentamente do chão
    float riseSpeed = 0.43;
    float maxY = -1.0;
    float startY = -14.0;
    float cubeY = min(maxY, startY + iTime * riseSpeed);
    vec3 cubePos = vec3(0.0, cubeY, 30.0);
    vec3 cubeSize = vec3(3.7, 10.0, 2.0);

    vec3 localP = p - cubePos;

    float rotationAngle = -0.5;
    mat2 rotationMatrix = mat2(cos(rotationAngle), -sin(rotationAngle),
                               sin(rotationAngle),  cos(rotationAngle));

    localP.xz = rotationMatrix * localP.xz;

    d = sdBox(localP, cubeSize);
    if (d < s.dist) {
        float u = (localP.x + cubeSize.x) / (2.0 * cubeSize.x);
        float v = (localP.y + cubeSize.y) / (2.0 * cubeSize.y);

        vec2 uv = vec2(u, v); 
        vec3 texColor = texture(iChannel2, uv).rgb;

        s.color = texColor;;
        s.id = 6.0;
        s.dist = d;
    }
        
    // Lógica da Lua
    float cyclePos = mod(iTime, DAY_DURATION) / DAY_DURATION;
    float nightProgress = clamp((cyclePos - DAY_NIGHT_RATIO) / (1.0 - DAY_NIGHT_RATIO), 0.0, 1.0);
    if (nightProgress > 0.0) {
        float horizonY   = -3.5;
        float peakY      = 12.0; 
        float arcRadiusX = 22.0;
        const float PI = 3.14159265359;
        float angle = nightProgress * PI;
        vec3 moonPos;
        moonPos.x = cos(angle) * arcRadiusX;
        moonPos.y = mix(horizonY, peakY, sin(angle));
        moonPos.z = 35.0;
        d = sdSphere(p, vec4(moonPos, 1.5));
        if (d < s.dist) {
            s.dist = d;
            s.color = vec3(0.9, 0.9, 0.7);
            s.id = 1.0;
        }
    }

    // Movimento da câmera
    float cameraZ = iTime * SPEED;
    p.z += cameraZ;

    // Plano verde
    d = sdPlane(p);
    if (d < s.dist) {
        vec2 uv = p.xz * 0.2; 
        uv = fract(uv);
        vec3 texColor = texture(iChannel1, uv).rgb;
        vec3 greenTint = vec3(0.05, 0.5, 0.1);
        texColor *= greenTint;

        s.color = texColor;
        s.dist = d;
        s.id = 2.0;
    }

    // Estrada cinza com listras brancas
    d = sdRoad(p);
    if (d < s.dist) {
        if (abs(p.x) < 0.09) {
            float zStripe = mod(p.z + iTime, 1.4);
            float stripeMask = step(0.5, zStripe);
            s.color = mix(vec3(1.0), vec3(0.1), stripeMask);
        } else {
            s.color = vec3(0.1);
        }
        s.dist = d;
        s.id = 3.0;
    }


    // --- LÓGICA DE DENSIDADE DAS ÁRVORES --- // NOVO
    // 1. Calcula o progresso da transição de densidade (de 0.0 a 1.0).
    float densityProgress = smoothstep(DENSITY_START_TIME, DENSITY_START_TIME + DENSITY_DURATION, iTime);
    
    // 2. Calcula o número de árvores a renderizar neste frame, interpolando entre o mínimo e o máximo.
    int numTreesToRender = int(mix(float(MIN_TREES), float(MAX_TREES), densityProgress));
        
// Árvores com surgimento suave e densidade progressiva
    // ALTERADO: O loop agora itera até o máximo possível de árvores.
    for (int i = 0; i < MAX_TREES; i++) {
    
        // ALTERADO: Pula a iteração se o índice 'i' for maior que o número de árvores a renderizar.
        if (i >= numTreesToRender) continue;
        
        float randomOffset = fract(sin(float(i) * 127.1) * 43758.5453) * 10.0;
        float side = (mod(float(i), 2.0) < 1.0) ? -1.0 : 1.0;
        float roadEdge = 1.5;
        float safeMargin = 0.5;
        float xPos = side * (roadEdge + safeMargin + randomOffset);

        // --- LÓGICA DE SURGIMENTO ---
        float zSpacing = TREE_SPACING * (0.8 + randomOffset * 0.4);
        float treeProgressZ = mod(cameraZ + float(i) * zSpacing, TREE_START_Z);
        float riseFactor = smoothstep(0.0, TREE_RISE_DISTANCE, treeProgressZ);
        float treeGrowthFactor = riseFactor * 1.3;
        float treeY = -1.5; // A base da árvore estará no chão
        float zPos = (TREE_START_Z + cameraZ) - treeProgressZ;
        vec3 treePos = vec3(xPos, treeY, zPos);
        // --- FIM DA LÓGICA ---

        // Passar o growthFactor para a função simpleTree
        Surface tree = simpleTree(p, treePos, treeGrowthFactor);
        if (tree.dist < s.dist) {
            s = tree;
        }
    }

    return s;
}


// Algoritmo principal de ray marching
Surface rayMarch(vec3 ro, vec3 rd) {
    float totalDist = 0.0;
    Surface result;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * totalDist;
        Surface s = map(p);

        if (s.dist < MIN_DISTANCE) {
            // Raio colidiu com objeto
            result = s;
            result.dist = totalDist;
            return result;
        }

        totalDist += s.dist;

        if (totalDist > MAX_DISTANCE) {
            // Raio não colidiu com nenhum objeto visível
            break;
        }
    }

    // Retorna fundo/“céu”
    result.dist = totalDist;
    result.id = -1.0;
    result.color = vec3(0.0); // preto por padrão

    return result;
}

// Calcula normal aproximada via diferenças centrais
vec3 getNormal(vec3 p) {
    float d = map(p).dist;
    vec2 e = vec2(0.01, 0);
    vec3 n = d - vec3(
        map(p - e.xyy).dist,
        map(p - e.yxy).dist,
        map(p - e.yyx).dist
    );

    return normalize(n);
}

// Calcula luz difusa com base em uma fonte pontual
float getLight(vec3 p) {
    vec3 lightPos = vec3(5, 5, 10); // posição da luz

    vec3 l = normalize(lightPos - p); // vetor da luz
    vec3 n = getNormal(p);            // normal da superfície

    float diff = clamp(dot(l, n), 0.0, 1.0) * 1.5; // intensidade da luz

    // Cálculo de sombra
    float shadow = rayMarch(p + n * MIN_DISTANCE * 2.0, l).dist;
    if (shadow < length(lightPos - p)) diff *= 0.1;

    return diff;
}


// Outra fonte de luz (sol no céu) - agora com ciclo dia/noite
float getSunLight(vec3 p, float dayAmount) {
    vec3 sunPosition = vec3(0, mix(5.0, 12.0, dayAmount), -0.3); // posição do sol/lua
    vec3 sunDirection = normalize(sunPosition - p);
    vec3 normalVector = getNormal(p);

    float diffuse = clamp(dot(normalVector, sunDirection), 0.0, 1.0) * 
                   mix(0.5, 2.0, dayAmount);

    float shadow = rayMarch(p + normalVector * MIN_DISTANCE * 2.0, sunDirection).dist;
    if (shadow < length(sunPosition - p)) diffuse *= 0.1;

    return diffuse;
}

// Cor do céu baseada no ângulo do raio (gradiente vertical) - agora com ciclo dia/noite
vec3 skyColor(vec3 rd, float dayAmount) {
    float t = clamp(0.5 * (rd.y + 1.0), 0.0, 1.0);
    
    // Cores para o dia
    vec3 dayBottom = vec3(0.8, 0.9, 1.0);
    vec3 dayTop = vec3(0.4, 0.7, 1.0);
    
    // Cores para a noite
    vec3 nightBottom = vec3(0.05, 0.05, 0.1);
    vec3 nightTop = vec3(0.0, 0.0, 0.03);
    
    // Mistura entre dia e noite
    vec3 bottomColor = mix(nightBottom, dayBottom, dayAmount);
    vec3 topColor = mix(nightTop, dayTop, dayAmount);
    
    return mix(bottomColor, topColor, t);
}

// Função principal que renderiza cada pixel
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

    // Calcula a quantidade de dia (0.0 a 1.0)
    float dayAmount = getDayNightCycle(iTime);
    
    vec3 ro = vec3(0, 0, -1);
    vec3 rd = normalize(vec3(uv.x, uv.y, 1));

    Surface s = rayMarch(ro, rd);

    vec3 color;

    if (s.id < 0.0) {
        // Céu com ciclo dia/noite
        color = skyColor(rd, dayAmount);
        
        // Estrelas durante a noite
        if (dayAmount < 0.5) {
            float stars = pow(fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453), 200.0);
            stars *= smoothstep(0.1, 0.5, 1.0 - dayAmount * 2.0);
            color += stars * vec3(1.0);
        }
    } else {
        // Objetos com iluminação adaptativa
        float diffuse = getSunLight(ro + rd * s.dist, dayAmount);
        float ambient = mix(0.2, 0.05, dayAmount);
        
        // Ajuste de cor baseado no tipo de objeto
        //if (s.id >= 4.0 && s.id <= 7.0) { // Se for árvore
            // Adiciona variação de cor às árvores
            //float colorVar = fract(sin(s.dist) * 43758.5453) * 0.2;
            //s.color.r += colorVar * 0.5;
            //s.color.g += colorVar;
        //}
        
        color = s.color * (diffuse + ambient);
    }

    C = vec4(color, 1.0);
}
