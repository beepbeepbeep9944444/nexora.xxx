local BASE = "https://raw.githubusercontent.com/beepbeepbeep9944444/nexora-src/main"
local KEY  = ""

local ENV = (getfenv and getfenv()) or _G

local function fetch(path)
    local url = BASE .. "/" .. path .. "?t=" .. tostring(tick())
    if KEY ~= "" then url = url .. "&key=" .. KEY end

    local body
    if httpget then
        local ok, res = pcall(httpget, url)
        if ok then body = res end
    end
    if not body or #body < 32 then
        local ok, res = pcall(function() return game:HttpGet(url, true) end)
        if ok then body = res end
    end

    if type(body) ~= "string" or #body < 32 then
        return nil, "no response for " .. path
    end
    if body:sub(1, 1) == "<" then
        return nil, path .. " served html, check the url"
    end
    if body:sub(1, 7) == "ERROR: " then
        return nil, body:sub(8)
    end
    return body
end

local function run(path, globalName)
    local src, err = fetch(path)
    if not src then return nil, err end

    ENV[globalName] = nil

    local fn = loadstring(src, "=nexora/" .. path)
    if type(fn) ~= "function" then
        return nil, "could not compile " .. path
    end

    local ok, res = pcall(fn)
    if not ok then
        return nil, path .. " errored: " .. tostring(res)
    end

    local value = res
    if value == nil then value = ENV[globalName] end
    if value == nil then
        return nil, path .. " produced nothing (" .. tostring(#src) .. " bytes)"
    end
    return value
end

local function boot(game_file)
    local prev = ENV.NEXORA_CORE
    if prev and prev.stop then pcall(prev.stop) end

    local NX, err = run("core.lua", "NEXORA_CORE")
    if not NX then
        warn("[nexora] core failed - " .. tostring(err))
        return
    end

    NX.placeId = game.PlaceId

    local profile
    profile, err = run("games/" .. game_file .. ".lua", "NEXORA_GAME")
    if not profile then
        warn("[nexora] " .. game_file .. " profile failed - " .. tostring(err))
        return
    end

    local ok, perr = pcall(profile, NX)
    if not ok then
        warn("[nexora] " .. game_file .. " profile errored - " .. tostring(perr))
        return
    end

    local mfile = (type(NX.movement) == "string" and NX.movement) or "movement"

    local mod
    mod, err = run(mfile .. ".lua", "NEXORA_MODULE")
    if not mod then
        warn("[nexora] " .. mfile .. " failed - " .. tostring(err))
        return
    end

    local rok, rerr = pcall(mod, NX)
    if not rok then
        warn("[nexora] setup failed - " .. tostring(rerr))
        return
    end

    local name = NX.gameName or game_file
    if notify then pcall(notify, name .. " loaded", "nexora", 3) end
    print("[nexora] loaded " .. name .. " - rshift for menu")

    NX.start("movement", "Movement")
end

local BLOXSTRIKE = 0

local pid = game.PlaceId

if pid == 328028363 then
    boot("tc2")
elseif pid == 301549746 or pid == 1480424328 then
    boot("cbro")
elseif pid == BLOXSTRIKE then
    boot("bloxstrike")
else
    boot("universal")
end
