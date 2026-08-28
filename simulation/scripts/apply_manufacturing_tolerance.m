function Eng = apply_manufacturing_tolerance(Eng, manufacturing_seed)
% APPLY_MANUFACTURING_TOLERANCE  Perturb the build-to-build-variable
% mechanical parameters by a small amount driven by a unit's manufacturing
% seed (a standard-normal draw), representing normal manufacturing
% tolerance between otherwise-identical engines. NOT a fault -- every unit
% gets this, healthy units included.
%
% V1 scope: only CrankInertia_kgm2 and FrictionCoeff_Nm_per_rpm are
% perturbed (+/-3% and +/-8% 1-sigma respectively -- friction varies more
% unit-to-unit in practice than a machined rotating inertia does). Other
% parameters are left at their nominal AeroDieselEngineParameters.m values;
% expand here if a specific fault's detectability turns out to be sensitive
% to build tolerance elsewhere.

Eng.CrankInertia_kgm2 = Eng.CrankInertia_kgm2 * (1 + 0.03*manufacturing_seed);
Eng.FrictionCoeff_Nm_per_rpm = Eng.FrictionCoeff_Nm_per_rpm * (1 + 0.08*manufacturing_seed);
end
