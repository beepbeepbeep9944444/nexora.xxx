--[[ nexora loader
     paste this into matcha. it reads your PlaceId and pulls the right module.

     BASE is the only line that changes when you move to the private gate:
       public  https://raw.githubusercontent.com/<you>/nexora-src/main
       gated   https://api.nexora.xxx/v1                                  ]]

local BASE = "https://raw.githubusercontent.com/beepbeepbeep9944444/nexora-src/main"
local KEY  = ""   -- leave empty while BASE is the public repo

local function get(path)
    local url = BASE .. "/" .. path .. "?t=" .. tostring(tick())
    if KEY ~= "" then url = url .. "&key=" .. KEY end
    local ok, body = pcall(function() return game:HttpGet(url, true) end)
    if not ok or type(body) ~= "string" or #body < 32 then
        return nil, "could not reach " .. path
    end
    if body:sub(1, 7) == "ERROR: " then return nil, body:sub(8) end
    return body
end

local function run(path)
    local src, err = get(path)
    if not src then return nil, err end
    local fn, cerr = loadstring(src, "=nexora/" .. path)
    if not fn then return nil, "compile " .. path .. ": " .. tostring(cerr) end
    local ok, res = pcall(fn)
    if not ok then return nil, "run " .. path .. ": " .. tostring(res) end
    return res
end

local function boot(module, name)
    local NX, err = run("core.lua")
    if not NX then return warn("[nexora] core failed - " .. tostring(err)) end

    local mod
    mod, err = run("games/" .. module .. ".lua")
    if not mod then return warn("[nexora] " .. module .. " failed - " .. tostring(err)) end

    NX.placeId = game.PlaceId
    NX.gameName = name
    mod(NX)
    NX.start("movement", "Movement")
    print("[nexora] loaded " .. name)
end

if game.PlaceId == 328028363 then
    boot("tc2", "typical colors 2")

elseif game.PlaceId == 301549746 or game.PlaceId == 1480424328 then
    boot("cbro", "counter blox")

else
    warn("[nexora] no module for place " .. tostring(game.PlaceId))
    warn("[nexora] supported: typical colors 2, counter blox")
end
