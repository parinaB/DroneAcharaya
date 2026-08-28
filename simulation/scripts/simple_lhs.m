function X = simple_lhs(n, d)
% SIMPLE_LHS  Latin Hypercube Sample of n points in d dimensions, each
% column in (0,1). No Statistics and Machine Learning Toolbox on this
% install (no lhsdesign), so implemented directly: standard stratified
% construction -- each dimension split into n equal strata, strata
% randomly assigned to sample rows (independently per dimension), one
% uniform-random point drawn within each assigned stratum.
X = zeros(n, d);
for j = 1:d
    perm = randperm(n)';
    X(:,j) = (perm - rand(n,1)) / n;
end
end
